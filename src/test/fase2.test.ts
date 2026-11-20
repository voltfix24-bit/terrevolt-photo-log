import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("browser-image-compression", () => ({ default: vi.fn() }));
vi.mock("@/lib/offline-queue", () => ({ getPendingPhotos: vi.fn(), markDone: vi.fn(), markError: vi.fn(), clearDone: vi.fn() }));
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));
import { uploadEnRegistreer, verwijderFoto, wachtrijPad } from "@/lib/fotos-service";
import { syncPendingPhotos, type SyncDeps } from "@/lib/sync-service";
import { downloadStationZip, zipNamen } from "@/lib/zip-download";
import { generatePdfHtml, escHtml, veiligeUrl, veiligHsl } from "@/lib/pdf-generator";
import { categorieKlaar, minFotos } from "@/lib/foto-regels";
import { verwijderStation } from "@/lib/station-service";

// Nep-client: storage + fotos-tabel in geheugen
function nepDb(opt: { uploadFout?: string; insertFout?: string; rmFout?: string; deleteFout?: string; geenRij?: boolean } = {}) {
  const bestanden = new Set<string>(); const rijen: { storage_path: string }[] = [];
  const db = {
    bestanden, rijen,
    storage: { from: () => ({
      upload: async (p: string) => { if (opt.uploadFout) return { error: { message: opt.uploadFout } }; if (bestanden.has(p)) return { error: { message: "The resource already exists", statusCode: "409" } }; bestanden.add(p); return { error: null }; },
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${p}` } }),
      remove: async (ps: string[]) => { if (opt.rmFout) return { error: { message: opt.rmFout } }; ps.forEach((p) => bestanden.delete(p)); return { error: null }; },
    }) },
    from: () => ({
      select: () => ({ eq: (_k: string, v: string) => ({ limit: async () => ({ data: rijen.filter((r) => r.storage_path === v), error: null }), then: (r: (x: unknown) => void) => r({ data: rijen, error: null }) }) }),
      insert: async (r: { storage_path: string }) => { if (opt.insertFout) return { error: { message: opt.insertFout } }; rijen.push(r); return { error: null }; },
      delete: () => ({ eq: () => ({ select: async () => (opt.deleteFout ? { data: null, error: { message: opt.deleteFout } } : { data: opt.geenRij ? [] : [{ id: "1" }], error: null }) }) }),
    }),
  };
  return db;
}
const reg = { stationId: "s1", categorie: "Trafo", volgorde: 0 };
const blob = new Blob(["x"], { type: "image/jpeg" });

describe("fotos-service", () => {
  it("succes: bestand en rij", async () => {
    const db = nepDb(); const r = await uploadEnRegistreer("a.jpg", blob, reg, db);
    expect(r.ok).toBe(true); expect(db.rijen).toHaveLength(1);
  });
  it("retry met zelfde pad maakt geen dubbele rij", async () => {
    const db = nepDb(); await uploadEnRegistreer("a.jpg", blob, reg, db);
    const r = await uploadEnRegistreer("a.jpg", blob, reg, db);
    expect(r.ok).toBe(true); expect(db.rijen).toHaveLength(1);
  });
  it("registratie mislukt: geen succes en nieuw bestand opgeruimd", async () => {
    const db = nepDb({ insertFout: "db stuk" }); const r = await uploadEnRegistreer("a.jpg", blob, reg, db);
    expect(r).toMatchObject({ ok: false, stap: "registratie" }); expect(db.bestanden.size).toBe(0);
  });
  it("opslag mislukt: geen rij", async () => {
    const db = nepDb({ uploadFout: "netwerk" }); const r = await uploadEnRegistreer("a.jpg", blob, reg, db);
    expect(r).toMatchObject({ ok: false, stap: "opslag" }); expect(db.rijen).toHaveLength(0);
  });
  it("verwijderen meldt fout bij mislukte rij-delete", async () => {
    expect((await verwijderFoto("1", "a.jpg", nepDb({ deleteFout: "nee" }))).ok).toBe(false);
  });
  it("verwijderen zonder rechten (0 rijen) is geen succes", async () => {
    expect((await verwijderFoto("1", "a.jpg", nepDb({ geenRij: true }))).ok).toBe(false);
  });
  it("verwijderen met rechten: rij en bestand weg", async () => {
    const db = nepDb(); db.bestanden.add("a.jpg");
    expect((await verwijderFoto("1", "a.jpg", db)).ok).toBe(true); expect(db.bestanden.has("a.jpg")).toBe(false);
  });
  it("wachtrijpad is stabiel per item", () => {
    expect(wachtrijPad("s1", "Trafo", "q1", blob, "a.jpg")).toBe(wachtrijPad("s1", "Trafo", "q1", blob, "a.jpg"));
  });
});

describe("offline sync", () => {
  let deps: SyncDeps;
  const item = { id: "q1", stationId: "s1", categorie: "Trafo", file: blob, fileName: "a.jpg" };
  beforeEach(() => {
    deps = { pending: vi.fn(async () => [item]), klaar: vi.fn(async () => {}), fout: vi.fn(async () => {}), opruimen: vi.fn(async () => {}), comprimeer: async (f) => f, upload: vi.fn() };
  });
  it("succes: item als klaar gemarkeerd", async () => {
    (deps.upload as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const r = await syncPendingPhotos(undefined, deps);
    expect(r).toMatchObject({ gelukt: 1, mislukt: 0 }); expect(deps.klaar).toHaveBeenCalledWith("q1");
  });
  it("mislukte registratie: item blijft staan met fout", async () => {
    (deps.upload as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, fout: "db stuk", stap: "registratie" });
    const r = await syncPendingPhotos(undefined, deps);
    expect(r.mislukt).toBe(1); expect(deps.klaar).not.toHaveBeenCalled(); expect(deps.fout).toHaveBeenCalledWith("q1", "db stuk");
  });
  it("netwerkfout (throw): item blijft staan", async () => {
    (deps.upload as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Failed to fetch"));
    const r = await syncPendingPhotos(undefined, deps);
    expect(r.mislukt).toBe(1); expect(deps.klaar).not.toHaveBeenCalled();
  });
  it("retry gebruikt hetzelfde opslagpad", async () => {
    const up = deps.upload as ReturnType<typeof vi.fn>;
    up.mockResolvedValueOnce({ ok: false, fout: "x", stap: "opslag" }).mockResolvedValueOnce({ ok: true });
    await syncPendingPhotos(undefined, deps); await syncPendingPhotos(undefined, deps);
    expect(up.mock.calls[0][0]).toBe(up.mock.calls[1][0]);
  });
});

describe("station verwijderen", () => {
  it("faalt zonder succes als de rij niet weg kan", async () => {
    expect((await verwijderStation("s1", nepDb({ deleteFout: "fk" }))).ok).toBe(false);
  });
  it("geen succes zonder beheerderssessie (0 rijen)", async () => {
    expect((await verwijderStation("s1", nepDb({ geenRij: true }))).ok).toBe(false);
  });
});

describe("zip", () => {
  const fotos = [{ id: "1", categorie: "Trafo", url: "u1" }, { id: "2", categorie: "Trafo", url: "u2" }];
  const ok = async () => ({ ok: true, status: 200, blob: async () => new Blob(["x"], { type: "image/jpeg" }) }) as unknown as Response;
  it("meldt gedeeltelijk resultaat", async () => {
    const haal = (async (u: string) => (u === "u2" ? ({ ok: false, status: 404 } as Response) : ok())) as typeof fetch;
    const r = await downloadStationZip("St", fotos, undefined, haal, () => {});
    expect(r).toEqual({ totaal: 2, gelukt: 1, mislukt: 1 });
  });
  it("faalt als alles mislukt", async () => {
    const haal = (async () => { throw new Error("net"); }) as typeof fetch;
    await expect(downloadStationZip("St", fotos, undefined, haal, () => {})).rejects.toThrow();
  });
  it("unieke bestandsnamen", () => {
    const n = zipNamen(fotos); expect(new Set(n.values()).size).toBe(2);
  });
});

describe("pdf escaping", () => {
  const kwaad = `<script>alert(1)</script><img src=x onerror="alert(2)">`;
  const html = generatePdfHtml(
    { naam_msr: kwaad, behuizingsnummer: kwaad, type_ruimte: kwaad, datum: kwaad, ingevuld_door: kwaad },
    [{ id: "1", categorie: "Trafo typeplaatje", url: `javascript:alert(3)` }, { id: "2", categorie: "Trafo typeplaatje", url: `https://x/a.jpg" onload="alert(4)` }],
    { bedrijfsnaam: kwaad, regio: kwaad, logo_url: "javascript:alert(5)", primary_color: "0 0% 0%; } body{display:none} {" },
    [{ categorie: "Trafo typeplaatje", opmerking: kwaad }], [{ categorie: kwaad, reden: kwaad }],
  );
  it("geen uitvoerbare tags of handlers uit invoer", () => {
    expect(html).not.toContain("<script>alert");
    expect(html).not.toMatch(/<img[^>]*onerror=/i);
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(/"\s*onload="alert/);
    expect(html).not.toContain("display:none} {");
  });
  it("helpers", () => {
    expect(escHtml(`"<'&`)).toBe("&quot;&lt;&#39;&amp;");
    expect(veiligeUrl("data:text/html,<x>")).toBe("");
    expect(veiligHsl("10 20% 30%", "d")).toBe("10 20% 30%");
    expect(veiligHsl("red;}", "d")).toBe("d");
  });
});

describe("foto-regels", () => {
  it("standaard 1 foto, ook categorie 31 (definitief)", () => {
    expect(minFotos(31)).toBe(1); expect(categorieKlaar(31, 1)).toBe(true); expect(categorieKlaar(5, 0)).toBe(false);
  });
});
