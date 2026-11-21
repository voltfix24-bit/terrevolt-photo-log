import type { BalItem, CaseItem, Partij } from "./to-rondes";
import { HOLD_PARTIJ_NAAM, holdDagen, holdPartij } from "./on-hold";

/** Presentation routing never changes the actual submission party or action owner. */
export function casePresentatie(c: CaseItem): { bal: BalItem[]; partijen: Partij[]; hold: boolean } {
  if (c.station.on_hold) {
    const wie = HOLD_PARTIJ_NAAM[holdPartij(c.station)];
    return { hold: true, partijen: [wie], bal: [{ wie, label: wie, txt: String(c.station.on_hold_reden ?? ""), dagen: holdDagen(c.station) }] };
  }
  if (c.station.dossier_status === "afgerond") return { hold: false, partijen: [], bal: [] };
  const bal = c.station.uitvoerder === "van_gelder"
    ? c.last?.status === "goedgekeurd"
      ? [{ wie: "Liander" as const, label: "Liander", txt: "TO goedgekeurd", dagen: c.bal[0]?.dagen ?? 0, geenDatum: c.bal[0]?.geenDatum }]
      : (c.bal.length ? c.bal : [{ wie: "Van Gelder" as const, label: "Van Gelder", txt: "TO klaarzetten en indienen", dagen: 0 }])
    : c.bal;
  return { hold: false, partijen: c.station.uitvoerder === "van_gelder" ? [c.last?.status === "goedgekeurd" ? "Liander" : "Van Gelder"] : [...new Set(bal.map(b => b.wie))], bal };
}

export const indieningTekst = (r: { status: string; ingediend_op: string | null } | null) =>
  !r || r.status === "open" ? "Nog niet ingediend" : r.ingediend_op ? null : "Indieningsdatum onbekend";