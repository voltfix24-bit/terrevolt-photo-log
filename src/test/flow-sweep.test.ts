import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("browser-image-compression", () => ({ default: vi.fn() }));
import { verwijderVoorbeeld } from "@/lib/fotos-service";
import { ophefSkipNaFoto, syncPendingPhotos, type SyncDeps } from "@/lib/sync-service";
import { sharepointStatusBijwerken } from "@/lib/station-service";
import { bewaarNotitie, heeftBeheerGeblokkeerdeNotities, verstuurNotitiesNaBeheer } from "@/lib/notities";

beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
describe("flow-sweep intended outcomes", () => {
  it.each([{ rows: [] }, { rows: [{ id: "ander" }] }])("example delete never removes a file when the intended row was not deleted: %j", async ({ rows }) => {
    const remove = vi.fn();
    const db = { from: vi.fn(() => ({ delete: () => ({ eq: () => ({ select: async () => ({ data: rows, error: null }) }) }) })), storage: { from: () => ({ remove }) } };
    expect((await verwijderVoorbeeld("voorbeeld", "pad", db)).ok).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
  it.each([null, { message: "storage denied" }])("example metadata success distinguishes storage failure: %j", async error => {
    const remove = vi.fn(async () => ({ error }));
    const db = { from: () => ({ delete: () => ({ eq: () => ({ select: async () => ({ data: [{ id: "voorbeeld" }], error: null }) }) }) }), storage: { from: () => ({ remove }) } };
    const result = await verwijderVoorbeeld("voorbeeld", "pad", db);
    expect(result.ok).toBe(true); expect(!!result.bestandBlijft).toBe(!!error);
    expect(remove).toHaveBeenCalledWith(["pad"]);
  });
  it.each([false, true])("photo queue clears only when the skip is actually absent (remaining=%s)", async remaining => {
    const eq = () => ({ eq: async () => ({ data: remaining ? [{ id: "skip" }] : [], error: null }) });
    const db = { from: () => ({ delete: () => ({ eq }), select: () => ({ eq }) }) };
    const done = vi.fn().mockResolvedValue(undefined); const failed = vi.fn().mockResolvedValue(undefined);
    const deps: SyncDeps = {
      pending: async () => [{ id: "q", stationId: "station", categorie: "Test", file: new Blob(["photo"]), fileName: "foto.jpg" }],
      klaar: done, fout: failed, opruimen: vi.fn(), comprimeer: async f => f,
      upload: async () => ({ ok: true, pad: "pad", url: "https://example.test/f", al: true }),
      ophefSkip: (id, cat) => ophefSkipNaFoto(id, cat, db),
    };
    const result = await syncPendingPhotos(undefined, deps);
    expect(result.gelukt).toBe(remaining ? 0 : 1); expect(result.mislukt).toBe(remaining ? 1 : 0);
    expect(done).toHaveBeenCalledTimes(remaining ? 0 : 1);
    expect(failed).toHaveBeenCalledTimes(remaining ? 1 : 0);
  });
  it.each([undefined, null, {}, { ok: false }, { ok: true }])("SharePoint status requires explicit positive acknowledgement: %j", async data => {
    const db = { functions: { invoke: async () => ({ data, error: null }) } };
    expect(await sharepointStatusBijwerken("station", db)).toBe((data as { ok?: boolean } | null | undefined)?.ok === true);
  });
  it("delivery distinguishes an authorization-blocked note from a network backlog", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await bewaarNotitie({ stationId: "station", categorie: "Test", tekst: "Behoud tekst" });
    expect(heeftBeheerGeblokkeerdeNotities("station")).toBe(true);
    expect(heeftBeheerGeblokkeerdeNotities("ander-station")).toBe(false);
    rpc.mockResolvedValue({ data: true, error: null });
    await verstuurNotitiesNaBeheer();
    expect(heeftBeheerGeblokkeerdeNotities("station")).toBe(false);
  });
});