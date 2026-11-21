import "fake-indexeddb/auto";
import { File as NodeFile } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (_name: string, value: { _tekst: string }) => mock.save(value._tekst ? { opmerking: value._tekst } : { deleted: true }),
  from: () => ({
    upsert: (value: unknown) => mock.save(value),
    delete: () => ({ eq: () => ({ eq: () => mock.save({ deleted: true }) }) }),
  }),
} }));
vi.mock("browser-image-compression", () => ({ default: vi.fn() }));

import { bewaarNotitie, lokaleNotitie, verstuurNotities } from "@/lib/notities";
import { getDB, getPendingPhotos, queuePhoto, markDone, markError, clearDone } from "@/lib/offline-queue";
import { syncPendingPhotos, type SyncDeps } from "@/lib/sync-service";
import { categorieKlaar, minFotos } from "@/lib/foto-regels";
import { verwijderFoto } from "@/lib/fotos-service";
import { verwijderStation, sharepointStatusBijwerken } from "@/lib/station-service";
import { internetVereist } from "@/lib/internet";

const online = (value: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
const note = { stationId: "test-station", categorie: "Stroomtransformatoren", tekst: "Zie foto" };

beforeEach(async () => {
  vi.restoreAllMocks();
  // fake-indexeddb uses Node structuredClone; jsdom File cannot survive that clone.
  vi.stubGlobal("File", NodeFile);
  online(true);
  localStorage.clear();
  mock.save.mockReset().mockResolvedValue({ data: true, error: null });
  await (await getDB()).clear("photo-queue");
});

describe("offline notities", () => {
  it("offline bewaren, herladen en online versturen zonder verlies", async () => {
    online(false);
    expect(await bewaarNotitie(note)).toBe("wachtrij");
    expect(mock.save).not.toHaveBeenCalled();
    expect(lokaleNotitie(note.stationId, note.categorie)).toBe("Zie foto");
    // Opnieuw laden leest uitsluitend de duurzame wachtrij, niet React-state.
    vi.resetModules();
    const herladen = await import("@/lib/notities");
    expect(herladen.lokaleNotitie(note.stationId, note.categorie)).toBe("Zie foto");
    online(true);
    expect(await herladen.verstuurNotities()).toBe(1);
    expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ opmerking: "Zie foto" }));
    expect(herladen.lokaleNotitie(note.stationId, note.categorie)).toBeUndefined();
  });
  it("netwerkfout bewaart tekst voor een succesvolle retry", async () => {
    mock.save.mockResolvedValueOnce({ error: new Error("netwerk") });
    expect(await bewaarNotitie(note)).toBe("wachtrij");
    expect(lokaleNotitie(note.stationId, note.categorie)).toBe("Zie foto");
    expect(await verstuurNotities()).toBe(1);
    expect(lokaleNotitie(note.stationId, note.categorie)).toBeUndefined();
  });
  it("verlopen beheer bewaart ook een leeg notitie-item voor retry", async () => {
    mock.save.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Beheer verlopen" } });
    expect(await bewaarNotitie({ ...note, tekst: "" })).toBe("beheer");
    expect(lokaleNotitie(note.stationId, note.categorie)).toBe("");
    expect(await verstuurNotities()).toBe(1);
    expect(lokaleNotitie(note.stationId, note.categorie)).toBeUndefined();
  });
  it("quota-fout weigert opgeslagen te melden", async () => {
    online(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("vol", "QuotaExceededError"); });
    await expect(bewaarNotitie(note)).rejects.toThrow("Notitie niet bewaard");
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("bewaren tijdens sync verliest nieuwe tekst of een andere categorie niet", async () => {
    online(false); await bewaarNotitie(note);
    let klaar: ((value: { data: boolean; error: null }) => void) | undefined;
    mock.save.mockImplementationOnce(() => new Promise<{ data: boolean; error: null }>(resolve => { klaar = resolve; }));
    online(true); const bezig = verstuurNotities();
    online(false);
    await bewaarNotitie({ ...note, tekst: "Nieuwe tekst" });
    await bewaarNotitie({ ...note, categorie: "Trafo", tekst: "Andere categorie" });
    klaar?.({ data: true, error: null }); await bezig;
    expect(lokaleNotitie(note.stationId, note.categorie)).toBe("Nieuwe tekst");
    expect(lokaleNotitie(note.stationId, "Trafo")).toBe("Andere categorie");
    online(true); expect(await verstuurNotities()).toBe(2);
    expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ opmerking: "Nieuwe tekst" }));
  });
  it("een lege notitie blijft offline bewaard en wordt online verwijderd", async () => {
    online(false); await bewaarNotitie({ ...note, tekst: "" });
    expect(lokaleNotitie(note.stationId, note.categorie)).toBe("");
    online(true); await verstuurNotities();
    expect(mock.save).toHaveBeenCalledWith({ deleted: true });
  });
});

describe("duurzame fotowachtrij", () => {
  const deps = (upload: SyncDeps["upload"]): SyncDeps => ({ pending: getPendingPhotos, klaar: markDone, fout: markError, opruimen: clearDone, comprimeer: async f => f, upload });
  it("offline foto blijft na herladen; registratie-fout blijft bewaard; retry gebruikt hetzelfde pad", async () => {
    online(false);
    const id = await queuePhoto("test-station", "Stroomtransformatoren", new File(["foto"], "foto.jpg", { type: "image/jpeg" }));
    vi.resetModules();
    const herladen = await import("@/lib/offline-queue");
    const pending = await herladen.getPendingPhotos();
    expect(pending).toHaveLength(1); expect(pending[0].id).toBe(id);
    expect(pending[0].file.size).toBe(4);
    const upload = vi.fn().mockResolvedValueOnce({ ok: false, fout: "registratie", stap: "registratie" }).mockResolvedValue({ ok: true, pad: "p", url: "https://example.test/p", al: false });
    await syncPendingPhotos(undefined, deps(upload));
    expect(upload).not.toHaveBeenCalled();
    online(true);
    expect((await syncPendingPhotos(undefined, deps(upload))).mislukt).toBe(1);
    expect((await getPendingPhotos())[0]).toMatchObject({ status: "error", pogingen: 1 });
    expect((await syncPendingPhotos(undefined, deps(upload))).gelukt).toBe(1);
    expect(upload.mock.calls[0][0]).toBe(upload.mock.calls[1][0]);
    expect(await getPendingPhotos()).toEqual([]);
  });
  it("een mislukte lokale opslag wordt niet als bewaard gemeld", async () => {
    vi.spyOn(await getDB(), "put").mockRejectedValueOnce(new DOMException("vol", "QuotaExceededError"));
    await expect(queuePhoto("test", "Trafo", new File(["foto"], "f.jpg"))).rejects.toThrow("vol");
    expect(await getPendingPhotos()).toEqual([]);
  });
  it("foto-sync heft N.v.t. op en bewaart het item als die stap nog mislukt", async () => {
    await queuePhoto("test-station", "Stroomtransformatoren", new File(["foto"], "f.jpg"));
    const upload = vi.fn().mockResolvedValue({ ok: true });
    const ophefSkip = vi.fn().mockRejectedValueOnce(new Error("netwerk")).mockResolvedValue(undefined);
    const d = { ...deps(upload), ophefSkip };
    expect((await syncPendingPhotos(undefined, d)).mislukt).toBe(1);
    expect(await getPendingPhotos()).toHaveLength(1);
    expect((await syncPendingPhotos(undefined, d)).gelukt).toBe(1);
    expect(ophefSkip).toHaveBeenCalledWith("test-station", "Stroomtransformatoren");
    expect(await getPendingPhotos()).toEqual([]);
  });
});

describe("offline beheer", () => {
  it("weigert verwijderen en SharePoint zonder een verzoek te starten", async () => {
    online(false);
    const db = { from: vi.fn(), functions: { invoke: vi.fn() } };
    expect(internetVereist()).toBe(false);
    expect((await verwijderFoto("id", "pad", db)).ok).toBe(false);
    expect((await verwijderStation("id", db)).ok).toBe(false);
    expect(await sharepointStatusBijwerken("id", db)).toBe(false);
    expect(db.from).not.toHaveBeenCalled(); expect(db.functions.invoke).not.toHaveBeenCalled();
  });
});

describe("categorie 31 definitief", () => {
  it("minimum is precies één foto", () => { expect(minFotos(31)).toBe(1); });
  it("zonder foto is de categorie niet klaar", () => { expect(categorieKlaar(31, 0)).toBe(false); });
  it("met één foto is de categorie klaar", () => { expect(categorieKlaar(31, 1)).toBe(true); });
});