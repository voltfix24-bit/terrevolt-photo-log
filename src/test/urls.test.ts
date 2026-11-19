import { describe, expect, it } from "vitest";
import { caseUrl, categorieUrl, korteUrl, leesSub, sectieUrl, subUrl, zoekOpCaseSlug, zoekOpStationSlug } from "@/lib/urls";

const metCase = { id: "520ed3e1-794b-4953-b907-f0fba0f1fed7", casenummer: " 0308029 ", casenaam: "Graaf Hendrikstraat 2", opdrachtgever: null, behuizingsnummer: "4 003 259", naam_msr: "Mariastraat", datum: "2026-11-18", created_at: "2025-01-01" };
const zonderCase = { id: "11111111-1111-1111-1111-111111111111", casenummer: "", casenaam: null, behuizingsnummer: "5 001 423", naam_msr: "Vyverlaan", created_at: "2026-02-01" };

describe("leesbare urls", () => {
  it("case-url volgt opdrachtgever (fallback van Gelder), jaar en casenummer-casenaam", () => {
    expect(caseUrl(metCase)).toBe("/van-gelder/2026/0308029-graaf-hendrikstraat-2");
  });
  it("jaar valt terug op created_at zonder datum/submitted_at", () => {
    expect(caseUrl({ ...metCase, datum: null })).toBe("/van-gelder/2025/0308029-graaf-hendrikstraat-2");
  });
  it("sectie- en categorie-slugs", () => {
    expect(sectieUrl(metCase, "trafo")).toMatch(/\/trafo$/);
    expect(categorieUrl(metCase, { id: 18 })).toBe("/van-gelder/2026/0308029-graaf-hendrikstraat-2/trafo/18-trafo-typeplaatje");
  });
  it("station zonder case krijgt /stations/behuizingsnummer-naam", () => {
    expect(caseUrl(zonderCase)).toBe("/stations/5001423-vyverlaan");
    expect(subUrl(zonderCase, leesSub(["opleveren"]))).toBe("/stations/5001423-vyverlaan/opleveren");
    expect(zoekOpStationSlug([zonderCase], "5001423-oude-naam")?.id).toBe(zonderCase.id);
  });
  it("zoekt op casenummer, ongeacht de casenaam", () => {
    expect(zoekOpCaseSlug([metCase], "0308029-verkeerde-naam")[0]?.id).toBe(metCase.id);
    expect(zoekOpCaseSlug([metCase], "0308030-x")).toHaveLength(0);
  });
  it("categorie bepaalt de sectie; onbekend → case-niveau", () => {
    expect(leesSub(["ms-deel", "18-iets"])).toEqual({ soort: "categorie", sectionId: "trafo", categorieId: 18 });
    expect(leesSub(["bestaat-niet"])).toEqual({ soort: "case" });
  });
  it("korte link met gepubliceerd domein", () => {
    expect(korteUrl(metCase)).toBe("https://to-foto.lovable.app/c/0308029");
  });
});
