import { describe, it, expect } from "vitest";
import { dagenZonderHold, hervatRegel, hervattenVoorbij, holdDagen } from "@/lib/on-hold";
import { bordItems, groepenVan } from "@/lib/bord-groepen";
import { bouwPreview, startMapping } from "@/lib/case-import";
import type { CaseItem } from "@/lib/to-rondes";

const hold = { on_hold: true, on_hold_sinds: "2026-11-10", on_hold_reden: "Vergunning", on_hold_partij: "liander" as const };

describe("on hold", () => {
  it("on-hold-tijd telt niet mee in wachttijd", () => {
    expect(dagenZonderHold("2026-11-01", null, hold, "2026-11-20")).toBe(9);
    expect(dagenZonderHold("2026-11-01", null, null, "2026-11-20")).toBe(19);
  });
  it("sinds N dagen en hervatten? na verwachte datum", () => {
    expect(holdDagen(hold, "2026-11-20")).toBe(10);
    expect(hervattenVoorbij({ ...hold, on_hold_tot: "2026-11-19" }, "2026-11-20")).toBe(true);
    expect(hervattenVoorbij({ ...hold, on_hold_tot: "2026-11-20" }, "2026-11-20")).toBe(false);
  });
  it("hervatten schrijft geschiedenis", () => {
    expect(hervatRegel(hold, "2026-11-20")).toMatch(/^On hold van 10 nov\.? 2026 tot 20 nov\.? 2026: Vergunning$/);
  });
  it("afgekeurd met 2 actiepunten → één on-hold-kaart bij partij, telt niet als open", () => {
    const c = { station: { id: "a", uitvoerder: "terrevolt", ...hold }, rondes: [], last: { status: "afgekeurd" },
      bal: [{ wie: "TerreVolt", label: "TerreVolt", txt: "x", dagen: 1 }, { wie: "Derden", label: "Derden", txt: "y", dagen: 1 }] } as unknown as CaseItem;
    const items = bordItems([c]);
    expect(items).toHaveLength(1);
    const l = groepenVan(items, "Liander");
    expect(l.groepen.map((g) => g.key)).toEqual(["onhold"]);
    expect(l.open).toBe(0);
  });
  it("import herkent on hold ja/nee met reden", () => {
    const grid = [["Casenummer", "Naam", "On hold", "Reden"], ["1", "A", "ja", "Wacht"], ["2", "B", "nee", "x"]];
    const r = bouwPreview(grid, startMapping(grid[0]), []);
    expect([r[0].on_hold, r[0].on_hold_reden, r[1].on_hold, r[1].on_hold_reden]).toEqual([true, "Wacht", false, ""]);
  });
});
