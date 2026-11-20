// Groepering van het bord "Wie moet wat doen": kolom → groepen per actie
import { uitvoerderVan } from "@/lib/cases-filter";
import { HOLD_PARTIJ_NAAM, holdDagen, holdPartij, isOnHold } from "@/lib/on-hold";
import type { BalItem, CaseItem, Partij } from "@/lib/to-rondes";

export type Lane = Partij | "Derden";
export type GroepKey = "opnieuw" | "actiepunt" | "klaarzetten" | "beoordelen" | "goedgekeurd" | "onhold";
export type BordItem = BalItem & { c: CaseItem; lane: Lane; groep: GroepKey };

export const GROEP_KLEUR: Partial<Record<GroepKey, string>> = { opnieuw: "#B33A3A", beoordelen: "#1F4E8C", goedgekeurd: "#1F5C3A", onhold: "#6B4E8C" };

export const LANE_GROEPEN: Record<Lane, GroepKey[]> = {
  TerreVolt: ["opnieuw", "actiepunt", "klaarzetten", "onhold"],
  "Van Gelder": ["beoordelen", "actiepunt", "onhold"],
  Liander: ["beoordelen", "actiepunt", "goedgekeurd", "onhold"],
  Derden: ["actiepunt", "onhold"],
};

export function groepTitel(lane: Lane, g: GroepKey) {
  return { opnieuw: "Opnieuw indienen", actiepunt: `Actiepunt ${lane}`, klaarzetten: "TO klaarzetten en indienen", beoordelen: "TO beoordelen", goedgekeurd: "Goedgekeurd", onhold: "On hold" }[g];
}

function groepVan(lane: Lane, txt: string): GroepKey {
  if (txt === "TO beoordelen") return "beoordelen";
  if (txt === "TO goedgekeurd") return "goedgekeurd";
  if (lane === "TerreVolt" && txt.startsWith("Opnieuw indienen")) return "opnieuw";
  if (lane === "TerreVolt" && txt === "TO klaarzetten en indienen") return "klaarzetten";
  return "actiepunt";
}

// Kolomlogica ongewijzigd: VG-cases bij Van Gelder, behalve goedgekeurd → Liander
export function bordItems(cases: CaseItem[]): BordItem[] {
  return cases.flatMap((c) => {
    // On hold: één kaart, in de kolom van de partij bij wie het ligt
    if (isOnHold(c.station)) {
      const lane = HOLD_PARTIJ_NAAM[holdPartij(c.station)];
      return [{ wie: lane as Partij, label: lane, txt: (c.station.on_hold_reden as string) ?? "", dagen: holdDagen(c.station), c, lane, groep: "onhold" as GroepKey }];
    }
    const bal: BalItem[] = uitvoerderVan(c) === "van_gelder" && c.last?.status !== "goedgekeurd"
      ? [{ ...(c.bal[0] ?? { label: "Van Gelder", txt: "TO afgerond", dagen: 0 }), wie: "Van Gelder" }]
      : c.bal;
    return bal.map((b) => ({ ...b, c, lane: b.wie as Lane, groep: groepVan(b.wie as Lane, b.txt) }));
  });
}

// Langst wachtend bovenaan, kaarten zonder datum onderaan
export const sorteer = (a: BordItem, b: BordItem) => Number(!!a.geenDatum) - Number(!!b.geenDatum) || b.dagen - a.dagen;

export function groepenVan(items: BordItem[], lane: Lane) {
  const inLane = items.filter((i) => i.lane === lane);
  const groepen = LANE_GROEPEN[lane]
    .map((g) => ({ key: g, titel: groepTitel(lane, g), items: inLane.filter((i) => i.groep === g).sort(sorteer) }))
    .filter((g) => g.items.length > 0);
  const open = inLane.filter((i) => i.groep !== "goedgekeurd" && i.groep !== "onhold").length;
  return { groepen, open };
}
