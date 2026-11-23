// Uitgebreid zoeken in Cases & TO: alle woorden moeten ergens in de case voorkomen (EN),
// "aanhalingstekens" voor een exacte woordgroep, -woord om uit te sluiten,
// en veld:waarde (case:, naam:, wv:, is:, behuizing:, og:, status:, dossier:, bal:, actie:, reden:, notitie:, uitvoering:, hold:).
import { redenLabel, TO_STATUS, actieWie, type CaseItem } from "./to-rondes";
import { dossierLabel } from "./aandacht";
import { casePresentatie } from "./case-presentatie";

export const normaliseer = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_\-./]+/g, " ").trim();

const VELD_ALIAS: Record<string, string> = {
  case: "case", nr: "case", nummer: "case", casenummer: "case",
  naam: "naam", casenaam: "naam", station: "naam", msr: "naam",
  wv: "wv", is: "is", behuizing: "behuizing",
  og: "opdrachtgever", opdrachtgever: "opdrachtgever",
  status: "status", to: "status", dossier: "dossier",
  bal: "bal", partij: "bal", actie: "actie", acties: "actie",
  reden: "reden", redenen: "reden", notitie: "notitie",
  uitvoering: "uitvoering", uitvoerder: "uitvoering", hold: "hold",
};

export type ZoekTerm = { tekst: string; veld?: string; niet?: boolean };

export function parseZoek(q: string): ZoekTerm[] {
  const terms: ZoekTerm[] = [];
  const re = /(-?)(?:([a-zA-Z]+):)?(?:"([^"]*)"?|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const veld = m[2] ? VELD_ALIAS[m[2].toLowerCase()] : undefined;
    let ruw = m[3] ?? m[4] ?? "";
    if (m[2] && !veld) ruw = `${m[2]}:${ruw}`; // onbekend veld = gewone tekst
    const tekst = normaliseer(ruw);
    if (tekst) terms.push({ tekst, veld, niet: m[1] === "-" });
  }
  return terms;
}

export const VELD_NAAM: Record<string, string> = {
  case: "Casenummer", naam: "Naam", wv: "WV", is: "IS-nummer", behuizing: "Behuizing",
  opdrachtgever: "Opdrachtgever", status: "TO-status", dossier: "Dossier", bal: "Bal bij",
  actie: "Actie", reden: "Afkeurreden", notitie: "Notitie", uitvoering: "Uitvoering", hold: "On hold",
};

export function caseVelden(c: CaseItem): Record<string, string> {
  const s = c.station as Record<string, unknown>;
  const acties = c.rondes.flatMap((r) => r.to_acties ?? []);
  let bal = "";
  try { const p = casePresentatie(c); bal = [...p.partijen, ...((p as { actieBij?: string[] }).actieBij ?? [])].join(" "); } catch { /* geen presentatie */ }
  const statussen = c.rondes.map((r) => TO_STATUS[r.status]?.label ?? r.status);
  return {
    case: normaliseer(s.casenummer),
    naam: normaliseer([s.casenaam, s.naam_msr].join(" ")),
    wv: normaliseer(s.wv),
    is: normaliseer(s.is_nummer),
    behuizing: normaliseer(s.behuizingsnummer),
    opdrachtgever: normaliseer(s.opdrachtgever),
    status: normaliseer([c.last ? TO_STATUS[c.last.status]?.label : "TO open", ...statussen, c.last?.ingediend_bij, `ronde ${c.rondes.length}`].join(" ")),
    dossier: normaliseer([dossierLabel(s.dossier_status as string | null), s.dossier_status, s.status].join(" ")),
    bal: normaliseer([bal, ...c.bal.map((b) => `${b.wie} ${b.txt}`)].join(" ")),
    actie: normaliseer(acties.map((a) => `${a.omschrijving} ${actieWie(a)} ${a.notitie ?? ""} ${a.afgehandeld_op ? "afgehandeld" : "open"}`).join(" ")),
    reden: normaliseer(c.rondes.flatMap((r) => [...r.redenen, ...(r.open_redenen ?? [])].map((k) => redenLabel(k))).join(" ")),
    notitie: normaliseer([s.dossier_notitie, ...c.rondes.map((r) => r.notitie)].join(" ")),
    uitvoering: normaliseer(s.uitvoerder === "van_gelder" ? "Van Gelder" : "TerreVolt"),
    hold: normaliseer(s.on_hold ? `on hold ${s.on_hold_reden ?? ""} ${s.on_hold_partij ?? ""}` : ""),
  };
}

/** Geeft per case de velden terug waarin gevonden is, of null als de case niet past. */
export function zoekMatch(c: CaseItem, terms: ZoekTerm[], velden = caseVelden(c)): string[] | null {
  const gevonden = new Set<string>();
  for (const t of terms) {
    const keys = t.veld ? [t.veld] : Object.keys(velden);
    const raak = keys.filter((k) => velden[k]?.includes(t.tekst));
    if (t.niet ? raak.length : !raak.length) return null;
    if (!t.niet) raak.forEach((k) => gevonden.add(k));
  }
  return [...gevonden];
}

export function zoekCases(cases: CaseItem[], q: string): CaseItem[] {
  const terms = parseZoek(q);
  if (!terms.length) return cases;
  return cases
    .map((c) => ({ c, v: caseVelden(c) }))
    .map(({ c, v }) => {
      const m = zoekMatch(c, terms, v);
      if (!m) return null;
      // Sorteer: exact casenummer eerst, dan treffers in nummer/naam.
      const score = terms.reduce((n, t) => n + (v.case === t.tekst ? 100 : 0) + (v.case.startsWith(t.tekst) ? 10 : 0) + (v.naam.includes(t.tekst) ? 3 : 0), 0);
      return { c, score };
    })
    .filter((x): x is { c: CaseItem; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}
