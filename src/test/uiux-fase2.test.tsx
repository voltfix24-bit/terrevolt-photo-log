import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { File as NodeFile, Blob as NodeBlob } from "node:buffer";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({ pin: vi.fn(async () => true), toastOk: vi.fn(), toastErr: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { const b: Record<string, unknown> = {}; for (const k of ["select", "eq"]) b[k] = () => b; b.maybeSingle = async () => ({ data: null, error: null }); return b; },
  rpc: async () => ({ data: true, error: null }),
} }));
vi.mock("@/lib/require-pin", () => ({ fotowerkVoorActie: m.pin, requirePin: m.pin, zorgVoorBeheer: m.pin, BEHEER_NODIG: "Beheer vergrendeld" }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: m.toastOk, error: m.toastErr, info: vi.fn() }) }));
vi.mock("browser-image-compression", () => ({ default: vi.fn(async (f: Blob) => f) }));
vi.mock("yet-another-react-lightbox", () => ({ default: () => null }));

import { bevries, claimItem, getCategorieItems, getDB, getPendingPhotos, getQueueCountVoor, markError, queuePhoto, LEASE_MS } from "@/lib/offline-queue";
import { syncPendingPhotos, type SyncDeps } from "@/lib/sync-service";
import { uploadEnRegistreer, wachtrijPad } from "@/lib/fotos-service";
import { useWachtrijCategorie, _previewUrls } from "@/hooks/use-wachtrij-categorie";
import { useStationUpload } from "@/hooks/use-station-upload";
import { WizardView } from "@/components/WizardView";

const foto = (naam = "IMG_0001.jpg", type = "image/jpeg") => new NodeFile(["pixels"], naam, { type }) as unknown as File;
let n = 0;
beforeEach(async () => {
  cleanup(); const d = await getDB(); await d.clear("photo-queue");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  globalThis.URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`); globalThis.URL.revokeObjectURL = vi.fn();
  m.pin.mockClear(); m.toastOk.mockClear(); m.toastErr.mockClear();
});

// Fictieve opslag + fotos-tabel met unieke wachtrijpaden en instelbare verloren antwoorden.
function nepServer(o: { verliesUpload?: number; verliesInsert?: number; weigerInsert?: number } = {}) {
  const bestanden = new Map<string, Blob>(); const rijen: { storage_path: string }[] = []; const verwijderd: string[] = [];
  const s = { ...o };
  const db = {
    bestanden, rijen, verwijderd,
    storage: { from: () => ({
      upload: async (p: string, b: Blob) => {
        if (bestanden.has(p)) return { error: { message: "The resource already exists", statusCode: "409" } };
        bestanden.set(p, b);
        if (s.verliesUpload && s.verliesUpload-- > 0) return { error: { message: "Failed to fetch" } };
        return { error: null };
      },
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://fictief/${p}` } }),
      remove: async (ps: string[]) => { ps.forEach((p) => { verwijderd.push(p); bestanden.delete(p); }); return { error: null }; },
    }) },
    from: () => ({
      select: () => ({ eq: (_k: string, v: string) => ({ limit: async () => ({ data: rijen.filter((r) => r.storage_path === v), error: null }) }) }),
      insert: async (r: { storage_path: string }) => {
        if (s.weigerInsert && s.weigerInsert-- > 0) return { error: { message: "new row violates row-level security policy", code: "42501" } };
        if (rijen.some((x) => x.storage_path === r.storage_path)) return { error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        rijen.push(r);
        if (s.verliesInsert && s.verliesInsert-- > 0) throw new Error("Failed to fetch");
        return { error: null };
      },
    }),
  };
  return db;
}
const deps = (db: ReturnType<typeof nepServer>, extra: Partial<SyncDeps> = {}): SyncDeps => ({
  pending: getPendingPhotos, klaar: async (id) => { const d = await getDB(); await d.delete("photo-queue", id); }, fout: markError, opruimen: async () => {},
  comprimeer: async (f) => f, upload: (p, b, r) => uploadEnRegistreer(p, b, r, db), ophefSkip: async () => {}, claim: claimItem, bevries, ...extra,
});

describe("duurzame identiteit en convergentie", () => {
  it("two offline photos with the same filename stay distinct across remount and category switch", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const a = await queuePhoto("S", "Trafo", foto(), { id: "S-a", pad: "stations/S/trafo/q_S-a.jpg" });
    const b = await queuePhoto("S", "Trafo", foto(), { id: "S-b", pad: "stations/S/trafo/q_S-b.jpg" });
    await queuePhoto("S", "Lips", foto(), { id: "S-c", pad: "stations/S/lips/q_S-c.jpg" });
    expect(a).not.toBe(b);
    const { result, rerender, unmount } = renderHook(({ cat }) => useWachtrijCategorie("S", cat), { initialProps: { cat: "Trafo" } });
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(["S-a", "S-b"]));
    const urls = result.current.items.map((i) => i.url);
    rerender({ cat: "Lips" }); await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(["S-c"]));
    rerender({ cat: "Trafo" }); await waitFor(() => expect(result.current.items.map((i) => i.url)).toEqual(urls));
    unmount();
    const opnieuw = renderHook(() => useWachtrijCategorie("S", "Trafo"));
    await waitFor(() => expect(opnieuw.result.current.items.map((i) => i.url)).toEqual(urls));
    expect(result.current.items.every((i) => i.status === "pending")).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(urls[0]);
    expect(_previewUrls.has("S-a")).toBe(true);
  });

  it.each([["storage write with lost response", { verliesUpload: 1 }], ["committed INSERT with lost response", { verliesInsert: 1 }]])("%s converges to exactly one row and a usable file", async (_n, o) => {
    const db = nepServer(o);
    await queuePhoto("S", "Trafo", foto(), { id: "S-q", pad: "stations/S/trafo/q_S-q.jpg" });
    const eerste = await syncPendingPhotos(undefined, deps(db));
    if ("verliesUpload" in o) expect(eerste.mislukt).toBe(1);
    await syncPendingPhotos(undefined, deps(db));
    expect(db.rijen).toHaveLength(1); expect(db.bestanden.has("stations/S/trafo/q_S-q.jpg")).toBe(true);
    expect(db.verwijderd).toEqual([]); expect(await getPendingPhotos()).toEqual([]);
  });

  it("an uncertain INSERT failure never removes the possibly registered object", async () => {
    const db = nepServer({ weigerInsert: 1 });
    const r = await uploadEnRegistreer("stations/S/trafo/q_x.jpg", foto(), { stationId: "S", categorie: "Trafo", volgorde: 0 }, db);
    expect(r.ok).toBe(false); expect(db.verwijderd).toEqual([]); expect(db.bestanden.size).toBe(1);
  });

  it("legacy item: compression fails once (PNG) and would succeed later (JPEG); the frozen identity/path stays", async () => {
    await queuePhoto("S", "Trafo", foto("scherm.png", "image/png"));
    const comprimeer = vi.fn().mockImplementationOnce(async (f: File) => f).mockImplementation(async () => new NodeBlob(["jpeg"], { type: "image/jpeg" }) as unknown as Blob);
    const db = nepServer({ weigerInsert: 1 });
    await syncPendingPhotos(undefined, deps(db, { comprimeer }));
    const [item] = await getPendingPhotos();
    expect(item.voorbereid).toBe(true); expect(item.pad).toMatch(/\.png$/);
    await syncPendingPhotos(undefined, deps(db, { comprimeer }));
    expect(comprimeer).toHaveBeenCalledTimes(1);
    expect(db.rijen.map((r) => r.storage_path)).toEqual([item.pad]);
  });

  it("two workers/tabs with the same queue-ID: exclusive lease, one registration, no deletion", async () => {
    await queuePhoto("S", "Trafo", foto(), { id: "S-t", pad: "stations/S/trafo/q_S-t.jpg" });
    expect(await claimItem("S-t", "tab-A")).not.toBeNull();
    expect(await claimItem("S-t", "tab-B")).toBeNull();
    expect(await claimItem("S-t", "tab-B", Date.now() + LEASE_MS + 1)).not.toBeNull(); // verlopen lease na herladen wordt hersteld
    const db = nepServer();
    const pad = "stations/S/trafo/q_S-t.jpg"; const reg = { stationId: "S", categorie: "Trafo", volgorde: 0 };
    const [x, y] = await Promise.all([uploadEnRegistreer(pad, foto(), reg, db), uploadEnRegistreer(pad, foto(), reg, db)]);
    expect(x.ok && y.ok).toBe(true); expect(db.rijen).toHaveLength(1); expect(db.verwijderd).toEqual([]);
  });

  it("an interrupted 'uploading' item from a crashed session is resumed with the same photo", async () => {
    await queuePhoto("S", "Trafo", foto(), { id: "S-u", pad: "stations/S/trafo/q_S-u.jpg" });
    const d = await getDB(); const it0 = await d.get("photo-queue", "S-u");
    await d.put("photo-queue", { ...it0!, status: "uploading", leaseEigenaar: "dode-tab", leaseTot: Date.now() - 1 });
    const db = nepServer(); expect((await syncPendingPhotos(undefined, deps(db))).gelukt).toBe(1);
    expect(db.rijen).toHaveLength(1);
  });

  it("expired PIN / delivered meanwhile: file stays, marked 'beheer', no background prompt; resumes after unlock", async () => {
    await queuePhoto("S", "Trafo", foto(), { id: "S-p", pad: "stations/S/trafo/q_S-p.jpg" });
    const db = nepServer({ weigerInsert: 1 });
    expect((await syncPendingPhotos(undefined, deps(db))).mislukt).toBe(1);
    const [item] = await getPendingPhotos();
    expect(item).toMatchObject({ status: "error", foutSoort: "beheer", pad: "stations/S/trafo/q_S-p.jpg" });
    expect(m.pin).not.toHaveBeenCalled();
    expect((await syncPendingPhotos(undefined, deps(db))).gelukt).toBe(1);
    expect(db.rijen).toHaveLength(1);
  });

  it("per-station count uses key cursors only", async () => {
    for (let i = 0; i < 5; i++) await queuePhoto(i < 3 ? "A" : "B", "C", foto());
    const values = vi.spyOn(IDBIndex.prototype, "getAll"), get = vi.spyOn(IDBObjectStore.prototype, "get"), cur = vi.spyOn(IDBIndex.prototype, "openCursor");
    expect(await getQueueCountVoor("A")).toBe(3);
    expect(values).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled(); expect(cur).not.toHaveBeenCalled();
  });
});

describe("useStationUpload", () => {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: new QueryClient() }, children);
  const opts = { fotosByCategorie: () => [], isSkipped: () => false, removeSkip: vi.fn() };

  it("snapshots files/station/category before the first await; rapid category switch stores the right category", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useStationUpload("S", opts), { wrapper });
    const lijst = [foto("a.jpg")];
    await act(async () => { const p1 = result.current.handleUpload("Trafo", lijst); lijst.length = 0; const p2 = result.current.handleUpload("Lips", [foto("a.jpg")]); await Promise.all([p1, p2]); });
    expect((await getCategorieItems("S", "Trafo")).length).toBe(1);
    expect((await getCategorieItems("S", "Lips")).length).toBe(1);
    const [i] = await getCategorieItems("S", "Trafo");
    expect(i.voorbereid).toBe(true); expect(i.pad).toBe(wachtrijPad("S", "Trafo", i.id, i.file, "a.jpg"));
  });

  it("full device storage: no 'bewaard' success and a concrete recovery message", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await getDB(); vi.spyOn(IDBObjectStore.prototype, "add").mockImplementationOnce(() => { throw new DOMException("vol", "QuotaExceededError"); });
    const { result } = renderHook(() => useStationUpload("S", opts), { wrapper });
    let mislukt: string[] = [];
    await act(async () => { mislukt = await result.current.handleUpload("Trafo", [foto("vol.jpg")]); });
    expect(mislukt).toEqual(["vol.jpg"]); expect(m.toastOk).not.toHaveBeenCalled();
    expect(String(m.toastErr.mock.calls[0][0])).toMatch(/opslag van dit toestel/);
    expect(await getPendingPhotos()).toEqual([]);
  });

  it("protected dossier offline is refused before anything is stored", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useStationUpload("S", { ...opts, beschermd: true }), { wrapper });
    await act(async () => { await result.current.handleUpload("Trafo", [foto()]); });
    expect(await getPendingPhotos()).toEqual([]);
  });
});

describe("WizardView mobiele fotoactie", () => {
  const cat = { id: 4, name: "Lips-sloten", effectiveName: "Lips-sloten", section: "algemeen", effectiveInstruction: "", effectiveTip: "" };
  const cat2 = { ...cat, id: 5, name: "Overzicht binnenzijde (LS & MS)", effectiveName: "Overzicht binnenzijde (LS & MS)" };
  const props = (fotos: { id: string; url: string; storage_path: string; categorie: string }[] = [], nr: string | null = "5 001 846") => ({
    startIndex: 0, stationId: "S", onClose: vi.fn(), onSkip: vi.fn(), onUnskip: vi.fn(), skipped: [], skippedReasons: {},
    station: { vermogensveld: false, da_kast: false, naam_msr: "Een zeer lange stationsnaam aan de Mozartstraat in Twello", behuizingsnummer: nr, type_ruimte: null },
    fotos, fotosByCategorie: (c: string) => fotos.filter((f) => f.categorie === c), isUploading: null, uploadProgress: {},
    onUpload: vi.fn(), onDelete: vi.fn(), onClickThumb: vi.fn(), onOpenPdf: vi.fn(), filledCount: 0, voorbeelden: [],
    applicableCategories: [cat, cat2] as never,
  });
  const wrap = (el: ReactNode) => render(createElement(QueryClientProvider, { client: new QueryClient() }, el));

  it("empty category: station context with fallback, 'Foto maken' primary, library and 'Later invullen' reachable", async () => {
    wrap(createElement(WizardView, props([], null)));
    expect(screen.getByTestId("station-context").textContent).toContain("Geen stationsnummer");
    expect(screen.getAllByRole("button", { name: /Foto maken/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Uit bibliotheek/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Later invullen/ }));
    expect(await screen.findByText("Overzicht binnenzijde (LS & MS)", { selector: "h1" })).toBeTruthy();
  });

  it("after the required photo: 'Verder: [categorie]' plus 'Nog een foto'; no automatic transition", async () => {
    const p = props([{ id: "f1", url: "https://fictief/1.jpg", storage_path: "stations/S/x/q_1.jpg", categorie: "Lips-sloten" }]);
    wrap(createElement(WizardView, p));
    expect(screen.getByTestId("station-context").textContent).toContain("5 001 846");
    expect(screen.getByRole("button", { name: /Verder: Overzicht binnenzijde/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nog een foto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Foto 1: verstuurd/ })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 1700));
    expect(screen.getByText("Lips-sloten", { selector: "h1" })).toBeTruthy();
  });

  it("queued photos show durable status text; a confirmed server photo replaces its preview (dedup by path)", async () => {
    await queuePhoto("S", "Lips-sloten", foto(), { id: "S-1", pad: "stations/S/lips/q_S-1.jpg" });
    await queuePhoto("S", "Lips-sloten", foto(), { id: "S-2", pad: "stations/S/lips/q_S-2.jpg" });
    await markError("S-2", "Failed to fetch");
    const view = wrap(createElement(WizardView, props()));
    expect(await screen.findByRole("button", { name: /Foto 2: Versturen mislukt — opnieuw proberen/ })).toBeTruthy();
    expect(screen.getByTestId("wachtrij-status").textContent).toMatch(/1 bewaard op dit toestel.*1 versturen mislukt/);
    view.unmount();
    wrap(createElement(WizardView, props([{ id: "f1", url: "https://fictief/1.jpg", storage_path: "stations/S/lips/q_S-1.jpg", categorie: "Lips-sloten" }])));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Foto \d/ })).toHaveLength(2));
    expect(screen.getByRole("button", { name: /Foto 1: verstuurd/ })).toBeTruthy();
  });
});
