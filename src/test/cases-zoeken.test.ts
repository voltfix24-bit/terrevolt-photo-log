import { describe, expect, it } from "vitest";
import { parseZoek, zoekCases } from "@/lib/cases-zoeken";
import type { CaseItem } from "@/lib/to-rondes";

const mk = (id: string, s: Record<string, unknown>, rondes: CaseItem["rondes"] = []): CaseItem =>
  ({ station: { id, uitvoerder: "terrevolt", dossier_status: "ingediend", ...s }, rondes, last: rondes.at(-1) ?? null, bal: [] }) as CaseItem;
const r = (status: "afgekeurd" | "goedgekeurd", redenen: string[], acties: string[] = []) =>
  ({ id: "r", station_id: "x", nummer: 1, status, ingediend_op: null, ingediend_bij: "Liander", reactie_op: null, redenen, notitie: null,
    to_acties: acties.map((o, k) => ({ id: String(k), ronde_id: "r", station_id: "x", omschrijving: o, bij: "TerreVolt", derde_naam: null, notitie: null, afgehandeld_op: null, created_at: "" })) }) as CaseItem["rondes"][number];

const cases = [
  mk("a", { casenummer: "0313990", casenaam: "Nieuweweg", wv: "WV-12" }),
  mk("b", { casenummer: "0318770", casenaam: "Halfje Bruin", uitvoerder: "van_gelder" }, [r("afgekeurd", ["meting"], ["Kabel herlabelen"])]),
  mk("c", { casenummer: "0400001", casenaam: "Één Straat", on_hold: true, on_hold_reden: "Wacht op Liander" }),
];
const ids = (q: string) => zoekCases(cases, q).map((c) => c.station.id);

describe("cases zoeken", () => {
  it("alle woorden moeten passen, accenten en hoofdletters tellen niet", () => {
    expect(ids("een straat")).toEqual(["c"]);
    expect(ids("halfje nieuweweg")).toEqual([]);
  });
  it("zoekt in acties, afkeurredenen en uitvoering", () => {
    expect(ids("herlabelen")).toEqual(["b"]);
    expect(ids("meetrapport")).toEqual(["b"]);
    expect(ids("uitvoering:gelder")).toEqual(["b"]);
  });
  it("veld, uitsluiten en exacte woordgroep", () => {
    expect(ids("wv:12")).toEqual(["a"]);
    expect(ids("03 -bruin")).toEqual(["a"]);
    expect(ids('"wacht op liander"')).toEqual(["c"]);
    expect(ids("hold:liander")).toEqual(["c"]);
  });
  it("exact casenummer staat bovenaan; lege zoekterm toont alles", () => {
    expect(ids("0318770")[0]).toBe("b");
    expect(ids("  ")).toEqual(["a", "b", "c"]);
    expect(parseZoek("onbekend:x")[0].veld).toBeUndefined();
  });
});
