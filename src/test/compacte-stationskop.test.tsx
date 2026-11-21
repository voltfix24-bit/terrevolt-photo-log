// Beslislogica van de compacte stationskop (fictieve gegevens, fake-indexeddb, gemockte RPC).
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { act, renderHook, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: "2026-11-21T20:00:00Z", error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc, from: () => ({}), auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } } }));

import { stationWerkfase, type WerkfaseInvoer } from "@/lib/station-werkfase";
import { getDB, getWachtrijSamenvattingVoor, markDone, markError, queuePhoto } from "@/lib/offline-queue";
import { useStationWachtrij } from "@/hooks/use-station-wachtrij";
import { useBeheerStatus, useCompacteBeheer, _beheerStore } from "@/lib/beheer-status-store";

const cats = [{ id: 1, name: "Aanzicht" }, { id: 2, name: "Trafo" }, { id: 31, name: "Aarding" }];
const basis = (x: Partial<WerkfaseInvoer> = {}): WerkfaseInvoer => ({ status: "in uitvoering", submittedAt: null, reviewReden: null, categorieen: cats,
  fotosPerCategorie: {}, overgeslagen: new Set(), afgekeurd: 0, lokaal: 0, bewaren: 0, leesFout: false, ...x });

describe("stationWerkfase", () => {
  it("nieuw alleen bij aantoonbaar niets begonnen", () => {
    expect(stationWerkfase(basis())).toEqual({ soort: "nieuw", totaal: 3, volgende: cats[0] });
  });
  it.each([
    ["lokale foto", { lokaal: 1 }], ["foto wordt bewaard", { bewaren: 1 }], ["N.v.t.", { overgeslagen: new Set(["Trafo"]) }],
    ["eerder aangeboden", { submittedAt: "2026-01-01" }], ["afkeurreden", { reviewReden: "onscherp" }], ["afgekeurde foto", { afgekeurd: 2 }],
    ["wachtrij onbekend", { lokaal: null }], ["afkeur onbekend", { afgekeurd: null }],
  ])("%s → bezig, niet nieuw", (_n, x) => {
    expect(stationWerkfase(basis(x as Partial<WerkfaseInvoer>)).soort).toBe("bezig");
  });
  it("telt ingevulde onderdelen via categorieKlaar + N.v.t., niet het fotoaantal", () => {
    expect(stationWerkfase(basis({ fotosPerCategorie: { Aanzicht: 5 }, overgeslagen: new Set(["Trafo"]) })))
      .toEqual({ soort: "bezig", ingevuld: 2, totaal: 3, volgende: cats[2] });
  });
  it("alles N.v.t. is een geldig ingevulde checklist", () => {
    expect(stationWerkfase(basis({ overgeslagen: new Set(cats.map((c) => c.name)) }))).toEqual({ soort: "ingevuld", totaal: 3, fotos: 0 });
  });
  it("laden en leesfout geven nooit een nul- of compleetmelding", () => {
    expect(stationWerkfase(basis({ fotosPerCategorie: null })).soort).toBe("laden");
    expect(stationWerkfase(basis({ overgeslagen: null })).soort).toBe("laden");
    expect(stationWerkfase(basis({ categorieen: [] })).soort).toBe("laden");
    expect(stationWerkfase(basis({ leesFout: true })).soort).toBe("leesfout");
  });
  it("opgeleverd/goedgekeurd volgen de werkelijke status", () => {
    expect(stationWerkfase(basis({ status: "opgeleverd", fotosPerCategorie: null })).soort).toBe("opgeleverd");
    expect(stationWerkfase(basis({ status: "goedgekeurd" })).soort).toBe("goedgekeurd");
  });
});

describe("wachtrijsamenvatting per station", () => {
  beforeEach(async () => { const d = await getDB(); await d.clear("photo-queue"); });
  const blob = () => new NodeBlob(["x"], { type: "image/jpeg" }) as unknown as Blob;
  it("telt open/fout/verstuurd zonder done als nog te versturen, per station", async () => {
    await queuePhoto("S1", "Trafo", blob(), { id: "a", pad: "S1/q_a.jpg", fileName: "a.jpg" });
    await queuePhoto("S1", "Trafo", blob(), { id: "b", pad: "S1/q_b.jpg", fileName: "b.jpg" });
    await queuePhoto("S1", "Trafo", blob(), { id: "c", pad: "S1/q_c.jpg", fileName: "c.jpg" });
    await queuePhoto("S2", "Trafo", blob(), { id: "d", pad: "S2/q_d.jpg", fileName: "d.jpg" });
    await markDone("a"); await markError("b", "netwerk");
    expect(await getWachtrijSamenvattingVoor("S1")).toEqual({ totaal: 3, open: 2, bezig: 0, fout: 1, verstuurd: 1 });
  });
  it("hook reageert op QUEUE_EVENT en negeert het vorige station", async () => {
    const { result, rerender } = renderHook(({ id }) => useStationWachtrij(id), { initialProps: { id: "S1" } });
    await waitFor(() => expect(result.current.samenvatting?.totaal).toBe(0));
    await act(async () => { await queuePhoto("S1", "Trafo", blob(), { id: "e", pad: "S1/q_e.jpg", fileName: "e.jpg" }); });
    await waitFor(() => expect(result.current.samenvatting?.open).toBe(1));
    rerender({ id: "S2" });
    expect(result.current.samenvatting).toBeNull(); // geen S1-cijfers op S2
    await waitFor(() => expect(result.current.samenvatting?.totaal).toBe(0));
  });
});

describe("gedeelde beheerstatus", () => {
  beforeEach(() => { _beheerStore.reset(); m.rpc.mockClear(); });
  it("één poller voor meerdere weergaven; compacte weergave registreert en geeft vrij bij unmount", async () => {
    const a = renderHook(() => useBeheerStatus());
    const b = renderHook(() => { useCompacteBeheer(true); return useBeheerStatus(); });
    await waitFor(() => expect(a.result.current.tot).toBe("2026-11-21T20:00:00Z"));
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(a.result.current.compact).toBe(1);
    b.unmount();
    expect(a.result.current.compact).toBe(0); // globale balk komt terug op andere routes
    a.unmount();
  });
});
