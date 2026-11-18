import { describe, it, expect } from "vitest";
import { dagenTotVerlopen } from "@/components/SharePointSleutelBanner";

describe("dagenTotVerlopen", () => {
  const nu = new Date("2026-11-18T12:00:00");
  it("telt dagen tot de verloopdatum", () => expect(dagenTotVerlopen("2026-12-18", nu)).toBe(30));
  it("is negatief als de sleutel verlopen is", () => expect(dagenTotVerlopen("2026-11-10", nu)).toBeLessThan(0));
  it("onbekend zonder datum", () => expect(dagenTotVerlopen(null, nu)).toBeNull());
});
