// Groepering van het bord "Wie moet wat doen": kolom → groepen per actie
import { casePresentatie } from "./case-presentatie";
import type { BalItem, CaseItem, Partij } from "@/lib/to-rondes";

export type Lane = Partij | "Derden";
export type GroepKey = "technisch" | "opnieuw" | "actiepunt" | "klaarzetten" | "beoordelen" | "goedgekeurd" | "onhold";
export type BordItem = BalItem & { c: CaseItem; lane: Lane; groep: GroepKey };

export const GROEP_KLEUR: Partial<Record<GroepKey, string>> = { opnieuw: "#B33A3A", beoordelen: "#1F4E8C", goedgekeurd: "#1F5C3A", onhold: "#6B4E8C" };

export const LANE_GROEPEN: Record<Lane, GroepKey[]> = {
  TerreVolt: ["technisch", "opnieuw", "actiepunt", "klaarzetten", "onhold"],
  "Van Gelder": ["technisch", "beoordelen", "actiepunt", "onhold"],
  Liander: ["beoordelen", "actiepunt", "goedgekeurd", "onhold"],
  Derden: ["actiepunt", "onhold"],
};

export function groepTitel(lane: Lane, g: GroepKey) {
  return { technisch: "Technisch gereed?", opnieuw: "Opnieuw indienen", actiepunt: `Actiepunt ${lane}`, klaarzetten: "TO klaarzetten en indienen", beoordelen: "TO beoordelen", goedgekeurd: "TO goedgekeurd · dossier nog niet afgerond", onhold: "On hold" }[g];
}

function groepVan(lane: Lane, txt: string): GroepKey {
  if (txt === "Technisch gereed?" || txt === "Technisch gereed maken") return "technisch";
  if (txt === "TO beoordelen") return "beoordelen";
  if (txt === "TO goedgekeurd") return "goedgekeurd";
  if (lane === "TerreVolt" && txt.startsWith("Opnieuw indienen")) return "opnieuw";
  if (lane === "TerreVolt" && txt === "TO klaarzetten en indienen") return "klaarzetten";
  return "actiepunt";
}

// Kolomlogica ongewijzigd: VG-cases bij Van Gelder, behalve goedgekeurd → Liander
export function bordItems(cases: CaseItem[]): BordItem[] {
  return cases.flatMap((c) => {
    const presentatie = casePresentatie(c);
    return presentatie.bal.map((b) => {
      const lane = c.station.uitvoerder === "van_gelder" || presentatie.hold ? presentatie.partijen[0] : b.wie;
      return { ...b, c, lane, groep: presentatie.hold ? "onhold" as const : groepVan(lane, b.txt) };
    });
  });
}

// Langst wachtend bovenaan, kaarten zonder datum onderaan
export const sorteer = (a: BordItem, b: BordItem) => Number(!!a.geenDatum) - Number(!!b.geenDatum) || b.dagen - a.dagen;

export function groepenVan(items: BordItem[], lane: Lane) {
  const inLane = items.filter((i) => i.lane === lane);
  const groepen = LANE_GROEPEN[lane]
    .map((g) => ({ key: g, titel: groepTitel(lane, g), items: inLane.filter((i) => i.groep === g).sort(sorteer) }))
    .filter((g) => g.items.length > 0);
  const openItems = inLane.filter((i) => i.groep !== "goedgekeurd" && i.groep !== "onhold");
  // `open` telt actiekaarten; `openCases` telt unieke cases (station.id) — één case kan meerdere acties hebben.
  return { groepen, open: openItems.length, openCases: uniekeCases(openItems), cases: uniekeCases(inLane), acties: inLane.length };
}

export const uniekeCases = (items: Pick<BordItem, "c">[]) => new Set(items.map((i) => i.c.station.id)).size;

/** Aantallen per partij voor de directe partijkeuze; onafhankelijk van het uitvoerderfilter berekend op de gegeven cases. */
export function partijTellingen(items: BordItem[]): Record<Lane, { acties: number; cases: number }> {
  const r = {} as Record<Lane, { acties: number; cases: number }>;
  for (const lane of Object.keys(LANE_GROEPEN) as Lane[]) { const g = groepenVan(items, lane); r[lane] = { acties: g.acties, cases: g.cases }; }
  return r;
}
