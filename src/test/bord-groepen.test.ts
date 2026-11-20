import { describe, it, expect } from "vitest";
import { bordItems, groepenVan } from "@/lib/bord-groepen";
import type { CaseItem, BalItem } from "@/lib/to-rondes";

const c = (id: string, bal: BalItem[], uitvoerder = "terrevolt", status = "afgekeurd"): CaseItem =>
  ({ station: { id, uitvoerder: uitvoerder as never }, rondes: [], last: { status } as never, bal });

describe("bord-groepen", () => {
  it("goedgekeurd telt niet mee als open en staat bij Liander", () => {
    const items = bordItems([c("a", [{ wie: "Liander", label: "Liander", txt: "TO goedgekeurd", dagen: 3 }], "van_gelder", "goedgekeurd"),
      c("b", [{ wie: "Liander", label: "Liander", txt: "TO beoordelen", dagen: 1 }], "terrevolt", "controle")]);
    const l = groepenVan(items, "Liander");
    expect(l.open).toBe(1);
    expect(l.groepen.map((g) => g.key)).toEqual(["beoordelen", "goedgekeurd"]);
  });
  it("TerreVolt-volgorde en lege groepen weg; zonder datum onderaan", () => {
    const items = bordItems([
      c("x", [{ wie: "TerreVolt", label: "TerreVolt", txt: "TO klaarzetten en indienen", dagen: 0, geenDatum: true }], "terrevolt", "open"),
      c("y", [{ wie: "TerreVolt", label: "TerreVolt", txt: "TO klaarzetten en indienen", dagen: 2 }], "terrevolt", "open"),
      c("z", [{ wie: "TerreVolt", label: "TerreVolt", txt: "Opnieuw indienen (ronde 2)", dagen: 1 }]),
    ]);
    const t = groepenVan(items, "TerreVolt");
    expect(t.groepen.map((g) => g.key)).toEqual(["opnieuw", "klaarzetten"]);
    expect(t.groepen[1].items.map((i) => i.c.station.id)).toEqual(["y", "x"]);
  });
});
