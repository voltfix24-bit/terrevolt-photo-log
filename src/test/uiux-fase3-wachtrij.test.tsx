// Gerichte regressies uit de onafhankelijke review van fase 2 (fictieve gegevens, fake-indexeddb).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { File as NodeFile, Blob as NodeBlob } from "node:buffer";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { openDB } from "idb";

const m = vi.hoisted(() => ({ sync: vi.fn(async () => ({ gelukt: 0, mislukt: 0, fouten: [] as string[] })), comp: { wacht: null as null | Promise<void> } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: true, error: null }) } }));
vi.mock("@/lib/require-pin", () => ({ fotowerkVoorActie: async () => true, requirePin: async () => true, zorgVoorBeheer: async () => true, BEHEER_NODIG: "Beheer vergrendeld" }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("browser-image-compression", () => ({ default: vi.fn(async (f: Blob) => { if (m.comp.wacht) await m.comp.wacht; return f; }) }));

import { claimItem, bevries, getDB, getPendingPhotos, markDone, markError, queuePhoto, clearDone, ruimVerstuurdOp, VERSTUURD_BEWAAR_MS, sluitDB, LEASE_MS, OPSLAG_GEBLOKKEERD_EVENT } from "@/lib/offline-queue";
import * as sync from "@/lib/sync-service";
import { geregistreerdWachtrijPad, uploadEnRegistreer } from "@/lib/fotos-service";
import { useWachtrijCategorie } from "@/hooks/use-wachtrij-categorie";

const foto = (naam = "IMG.jpg", type = "image/jpeg", inhoud = "pixels") => new NodeFile([inhoud], naam, { type }) as unknown as File;
let n = 0;
beforeEach(async () => {
  cleanup();
  const d = await getDB(); await d.clear("photo-queue");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  globalThis.URL.createObjectURL = vi.fn(() => `blob:p-${++n}`); globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// Fictieve server: opslag + fotos met unieke paden; ondersteunt like() voor legacy-herkenning.
function nepServer() {
  const bestanden = new Map<string, Blob>(); const rijen: { storage_path: string; station_id: string }[] = []; const verwijderd: string[] = [];
  const q = (filters: ((r: { storage_path: string; station_id: string }) => boolean)[]) => {
    const b = {
      eq: (k: string, v: string) => q([...filters, (r) => (r as Record<string, string>)[k] === v]),
      like: (k: string, v: string) => q([...filters, (r) => (r as Record<string, string>)[k].startsWith(v.replace(/%$/, ""))]),
      limit: async () => ({ data: rijen.filter((r) => filters.every((f) => f(r))), error: null }),
    };
    return b;
  };
  return {
    bestanden, rijen, verwijderd,
    storage: { from: () => ({
      upload: async (p: string, b: Blob) => bestanden.has(p) ? { error: { message: "The resource already exists", statusCode: "409" } } : (bestanden.set(p, b), { error: null }),
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://fictief/${p}` } }),
      remove: async (ps: string[]) => { ps.forEach((p) => { verwijderd.push(p); bestanden.delete(p); }); return { error: null }; },
    }) },
    from: () => ({
      select: () => q([]),
      insert: async (r: { storage_path: string; station_id: string }) => rijen.some((x) => x.storage_path === r.storage_path) ? { error: { message: "duplicate key", code: "23505" } } : (rijen.push(r), { error: null }),
    }),
  };
}
type Db = ReturnType<typeof nepServer>;
const deps = (db: Db, extra: Partial<sync.SyncDeps> = {}): sync.SyncDeps => ({
  pending: getPendingPhotos, klaar: markDone, fout: markError, opruimen: clearDone, comprimeer: async (f) => f,
  upload: (p, b, r) => uploadEnRegistreer(p, b, r, db), ophefSkip: async () => {}, claim: claimItem, bevries,
  bestaandPad: (i) => geregistreerdWachtrijPad(i.stationId, i.categorie, i.id, db), plan: () => {}, ...extra,
});

describe("1. herstart na actieve lease", () => {
  it("a new sync instance plans a retry at lease expiry and then resumes the same item without user action", async () => {
    await queuePhoto("S", "Trafo", foto(), { id: "S-l", pad: "stations/S/trafo/q_S-l.jpg" });
    const d = await getDB(); const it0 = await d.get("photo-queue", "S-l");
    await d.put("photo-queue", { ...it0!, status: "uploading", leaseEigenaar: "gecrashte-tab", leaseTot: Date.now() + 60_000 });
    const db = nepServer();
    let gepland: number | null = null;
    const r1 = await sync.syncPendingPhotos(undefined, deps(db, { eigenaar: "nieuwe-tab", plan: (ms) => { gepland = ms; } }));
    expect(r1.gelukt).toBe(0); expect(db.rijen).toHaveLength(0);
    expect(gepland).not.toBeNull(); expect(gepland!).toBeGreaterThan(58_000); expect(gepland!).toBeLessThanOrEqual(60_000);
    // Tijd verstrijkt tot ná het leaseverloop; de geplande herpoging (geen gebruikersactie) hervat hetzelfde item.
    const echt = Date.now(); vi.spyOn(Date, "now").mockReturnValue(echt + gepland! + 300);
    const r2 = await sync.syncPendingPhotos(undefined, deps(db, { eigenaar: "nieuwe-tab" }));
    expect(r2.gelukt).toBe(1); expect(db.rijen.map((r) => r.storage_path)).toEqual(["stations/S/trafo/q_S-l.jpg"]);
  });

  it("planHerpoging keeps one timer at the earliest expiry and fires syncPendingPhotos by itself", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false); // afgevuurde sync doet dan niets
    sync.planHerpoging(60_000); sync.planHerpoging(90_000); sync.planHerpoging(30_000);
    expect(vi.getTimerCount()).toBe(1); // één timer, op het vroegste verloop
    vi.advanceTimersByTime(30_249); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1); expect(vi.getTimerCount()).toBe(0); // vanzelf afgevuurd
  });
});

describe("4. lease-eigenaar bij finalisatie", () => {
  it("late A-error and A-done after B claimed leave B's lease and file intact", async () => {
    await queuePhoto("S", "Trafo", foto("a.jpg", "image/jpeg", "B-bytes"), { id: "S-o", pad: "stations/S/trafo/q_S-o.jpg" });
    const t = Date.now();
    expect(await claimItem("S-o", "A", t)).not.toBeNull();
    expect(await claimItem("S-o", "B", t + LEASE_MS + 1)).not.toBeNull();
    expect(await markError("S-o", "laat", "overig", "A")).toBe(false);
    expect(await markDone("S-o", "A")).toBe(false);
    const d = await getDB(); const item = await d.get("photo-queue", "S-o");
    expect(item).toMatchObject({ status: "uploading", leaseEigenaar: "B" });
    expect(item!.leaseTot).toBe(t + LEASE_MS + 1 + LEASE_MS);
    expect(await new Response(item!.file as Blob).text()).toBe("B-bytes");
    expect(await markDone("S-o", "B")).toBe(true);
  });
});

describe("5. legacy-uploadidentiteit", () => {
  it("real v1 item + existing row on old .png extension: reuses it, exactly one row and file, no compression", async () => {
    const id = await queuePhoto("S", "Trafo", foto("scherm.png", "image/png")); // v1: geen pad, niet voorbereid
    const db = nepServer();
    const oudPad = `stations/S/trafo/q_${id}.png`;
    db.bestanden.set(oudPad, new NodeBlob(["png"]) as unknown as Blob); db.rijen.push({ storage_path: oudPad, station_id: "S" });
    const comprimeer = vi.fn(async () => new NodeBlob(["jpeg"], { type: "image/jpeg" }) as unknown as Blob);
    const r = await sync.syncPendingPhotos(undefined, deps(db, { comprimeer }));
    expect(r.gelukt).toBe(1); expect(comprimeer).not.toHaveBeenCalled();
    expect(db.rijen.map((x) => x.storage_path)).toEqual([oudPad]); expect([...db.bestanden.keys()]).toEqual([oudPad]); expect(db.verwijderd).toEqual([]);
  });
});

describe("7. getroffen stations", () => {
  it("a sync started from A also processes B and announces B for refresh", async () => {
    await queuePhoto("A", "Trafo", foto(), { id: "A-1", pad: "stations/A/trafo/q_A-1.jpg" });
    await queuePhoto("B", "Trafo", foto(), { id: "B-1", pad: "stations/B/trafo/q_B-1.jpg" });
    const gezien: string[] = []; const h = (e: Event) => gezien.push((e as CustomEvent).detail.stationId);
    window.addEventListener(sync.SYNC_RESULTAAT_EVENT, h);
    await sync.syncPendingPhotos(undefined, deps(nepServer()));
    window.removeEventListener(sync.SYNC_RESULTAAT_EVENT, h);
    expect(gezien.sort()).toEqual(["A", "B"]);
  });
});

describe("6/7. categoriehydration", () => {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: new QueryClient() }, children);
  it("a confirmed tile stays 'Verstuurd' after queue cleanup until the server list has the path, then exactly one", async () => {
    await queuePhoto("S", "Trafo", foto(), { id: "S-1", pad: "stations/S/trafo/q_S-1.jpg" });
    await queuePhoto("S", "Trafo", foto(), { id: "S-2", pad: "stations/S/trafo/q_S-2.jpg" });
    let server = new Set<string>();
    const { result, rerender } = renderHook(() => useWachtrijCategorie("S", "Trafo", server), { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    await act(async () => { await claimItem("S-1", "x"); await markDone("S-1", "x"); await clearDone(); });
    await waitFor(() => expect(result.current.items.find((i) => i.id === "S-1")?.status).toBe("done"));
    expect(result.current.items).toHaveLength(2); // eerste blijft zichtbaar terwijl de rest wacht en de server traag is
    server = new Set(["stations/S/trafo/q_S-1.jpg"]); rerender();
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(["S-2"]));
  });
});

describe("4 (correctie). verstuurd over navigatie en remount", () => {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: new QueryClient() }, children);
  it("confirmed upload + slow server: category away/back and full remount keep the tile; after server takeover exactly one and safe cleanup", async () => {
    const pad = "stations/S/trafo/q_S-1.jpg";
    await queuePhoto("S", "Trafo", foto(), { id: "S-1", pad });
    let server = new Set<string>();
    const h = renderHook(({ cat }) => useWachtrijCategorie("S", cat, server), { wrapper, initialProps: { cat: "Trafo" } });
    await waitFor(() => expect(h.result.current.items).toHaveLength(1));
    // Sync bevestigt en ruimt op zoals in productie (opruimen = ruimVerstuurdOp).
    await act(async () => { await claimItem("S-1", "x"); await markDone("S-1", "x"); await ruimVerstuurdOp(); });
    await waitFor(() => expect(h.result.current.items[0]?.status).toBe("done"));
    h.rerender({ cat: "Lips" }); await waitFor(() => expect(h.result.current.items).toHaveLength(0));
    h.rerender({ cat: "Trafo" }); await waitFor(() => expect(h.result.current.items.map((i) => [i.id, i.status])).toEqual([["S-1", "done"]]));
    h.unmount();
    const r = renderHook(() => useWachtrijCategorie("S", "Trafo", server), { wrapper });
    await waitFor(() => expect(r.result.current.items.map((i) => [i.id, i.status])).toEqual([["S-1", "done"]]));
    expect(await getPendingPhotos()).toHaveLength(0); // geen herverzending
    server = new Set([pad]); r.rerender();
    await waitFor(() => expect(r.result.current.items).toHaveLength(0));
    await waitFor(async () => expect(await (await getDB()).get("photo-queue", "S-1")).toBeUndefined());
  });
  it("cleanup after sync keeps fresh confirmed items and removes only old ones", async () => {
    await queuePhoto("S", "Trafo", foto(), { id: "S-1", pad: "a" });
    await claimItem("S-1", "x"); await markDone("S-1", "x");
    await ruimVerstuurdOp();
    expect(await (await getDB()).get("photo-queue", "S-1")).toBeTruthy();
    await ruimVerstuurdOp(Date.now() + VERSTUURD_BEWAAR_MS + 1);
    expect(await (await getDB()).get("photo-queue", "S-1")).toBeUndefined();
  });
});

describe("3. verbinding na enqueue", () => {
  it("offline start, online during preparation: the photo is sent automatically after the durable write", async () => {
    const { useStationUpload } = await import("@/hooks/use-station-upload");
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    let los!: () => void; m.comp.wacht = new Promise<void>((r) => { los = r; });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: new QueryClient() }, children);
    const { result } = renderHook(() => useStationUpload("S", { fotosByCategorie: () => [], isSkipped: () => false, removeSkip: vi.fn() }), { wrapper });
    let p!: Promise<string[]>;
    act(() => { p = result.current.handleUpload("Trafo", [foto()]); });
    online.mockReturnValue(true); // netwerk hersteld vóór de queue-write
    los(); await act(async () => { await p; });
    m.comp.wacht = null;
    // Zonder actuele verbindingstoestand bleef het item 'pending' (oude online=false). Nu volgt een
    // verzendpoging; de fictieve client heeft geen opslag, dus de poging eindigt als bewaard 'error'.
    await waitFor(async () => { const d = await getDB(); const [i] = await d.getAll("photo-queue"); expect(i?.status).toBe("error"); });
    const d = await getDB(); const [i] = await d.getAll("photo-queue"); expect(i.pad).toMatch(/q_.*\.jpg$/);
  });
});

describe("2. echte IDB v1→v2-upgrade", () => {
  it("upgrade blocked by an open v1 connection reports it, resumes after close, bytes and records intact", async () => {
    await sluitDB();
    indexedDB.deleteDatabase("terrevolt-offline");
    await new Promise<void>((r) => { const q = indexedDB.deleteDatabase("terrevolt-offline"); q.onsuccess = () => r(); q.onerror = () => r(); });
    const v1 = await openDB("terrevolt-offline", 1, { upgrade(d) { const s = d.createObjectStore("photo-queue", { keyPath: "id" }); s.createIndex("by-station", "stationId"); s.createIndex("by-status", "status"); } });
    await v1.put("photo-queue", { id: "S-v1", stationId: "S", categorie: "Trafo", file: new NodeBlob(["oude-bytes"], { type: "image/jpeg" }), fileName: "oud.jpg", timestamp: "2026-01-01", status: "pending" });
    const meldingen: boolean[] = []; const h = (e: Event) => meldingen.push((e as CustomEvent).detail.geblokkeerd);
    window.addEventListener(OPSLAG_GEBLOKKEERD_EVENT, h);
    let klaar = false; const open = getDB().then((d) => { klaar = true; return d; });
    await waitFor(() => expect(meldingen).toContain(true));
    expect(klaar).toBe(false); // geen valse 'bewaard' terwijl geblokkeerd
    v1.close();
    const d = await open;
    window.removeEventListener(OPSLAG_GEBLOKKEERD_EVENT, h);
    expect(meldingen.at(-1)).toBe(false);
    const item = await d.get("photo-queue", "S-v1");
    expect(item).toMatchObject({ fileName: "oud.jpg", status: "pending" });
    expect(await new Response(item!.file as Blob).text()).toBe("oude-bytes");
    expect(d.transaction("photo-queue").store.indexNames.contains("by-station-cat")).toBe(true);
  });

  it("a newer version request makes this tab close its own connection (versionchange) instead of blocking it", async () => {
    await getDB();
    const nieuwer = await openDB("terrevolt-offline", 3, {});
    expect(nieuwer.version).toBe(3); nieuwer.close();
  });
});
