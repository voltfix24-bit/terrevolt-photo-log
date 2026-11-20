import type { CaseItem, Uitvoerder } from "@/lib/to-rondes";

export type UitvoerderFilter = "alle" | Uitvoerder;
export const FILTER_KEY = "to-uitvoerder-filter";
export const FILTER_OPTIES: { key: UitvoerderFilter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "terrevolt", label: "TerreVolt" },
  { key: "van_gelder", label: "Van Gelder" },
];

export function leesFilter(opslag: Pick<Storage, "getItem"> | undefined = typeof localStorage !== "undefined" ? localStorage : undefined): UitvoerderFilter {
  try {
    const v = opslag?.getItem(FILTER_KEY);
    return v === "terrevolt" || v === "van_gelder" || v === "alle" ? v : "alle";
  } catch { return "alle"; }
}
export function bewaarFilter(v: UitvoerderFilter, opslag: Pick<Storage, "setItem"> | undefined = typeof localStorage !== "undefined" ? localStorage : undefined) {
  try { opslag?.setItem(FILTER_KEY, v); } catch { /* opslag niet beschikbaar: alleen deze sessie */ }
}

/** Ontbrekende uitvoerder (oude cache) telt als TerreVolt, net als de database-default. */
export const uitvoerderVan = (c: CaseItem): Uitvoerder => (c.station.uitvoerder === "van_gelder" ? "van_gelder" : "terrevolt");

export function filterCases(cases: CaseItem[], f: UitvoerderFilter): CaseItem[] {
  return f === "alle" ? cases : cases.filter((c) => uitvoerderVan(c) === f);
}
export function tellingen(cases: CaseItem[]): Record<UitvoerderFilter, number> {
  const vg = cases.filter((c) => uitvoerderVan(c) === "van_gelder").length;
  return { alle: cases.length, van_gelder: vg, terrevolt: cases.length - vg };
}
