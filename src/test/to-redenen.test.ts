import { describe, expect, it } from "vitest";
import { REDENEN, OPEN_REDENEN, eigenKey, isReden, redenLabel, scoreVan, type CaseItem, type ToRonde } from "@/lib/to-rondes";

const ronde = (redenen: string[]): ToRonde => ({ id: "r", station_id: "s", nummer: 1, status: "afgekeurd", ingediend_op: null, ingediend_bij: null, reactie_op: null, redenen, notitie: null, to_acties: [] });
const c = (r: ToRonde): CaseItem => ({ station: { id: "s" }, rondes: [r], last: r, bal: [] });

describe("TO-redenen", () => {
  it("vaste keuzes volgens gebruiker", () => {
    expect(OPEN_REDENEN.map((r) => r.label)).toEqual(["Straatwerk", "kWh meter", "Flex OV", "SVK LT7 niet juist"]);
    expect(REDENEN.map((r) => r.label)).toEqual(["Naam bord", "kWh meter", "Flex OV", "SVK LT7 niet juist"]);
  });
  it("eigen reden via Anders is herkenbaar en leesbaar", () => {
    const k = eigenKey("  Kabel   te kort ");
    expect(k).toBe("eigen:Kabel te kort");
    expect(isReden(k)).toBe(true);
    expect(redenLabel(k)).toBe("Kabel te kort");
    expect(isReden("vrije importtekst")).toBe(false);
  });
  it("overzicht telt vaste en eigen redenen, geen importtekst", () => {
    const s = scoreVan([c(ronde(["flex_ov", eigenKey("Kabel te kort")])), c(ronde(["flex_ov", "losse tekst"]))]);
    expect(s.redenen).toEqual([{ key: "flex_ov", label: "Flex OV", n: 2 }, { key: "eigen:Kabel te kort", label: "Kabel te kort", n: 1 }]);
  });
});
