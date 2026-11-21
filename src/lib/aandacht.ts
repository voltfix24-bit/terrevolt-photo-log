// Aandachtlijst voor opvolging: bestaande acties (afkeur oplossen, hervatten nodig, dossier afronden).
// Gebruikt alleen bestaande datums en regels; er worden geen nieuwe deadlines bedacht.
import { casePresentatie } from "./case-presentatie";
import { amsterdamDatum, hervattenVoorbij, holdDatum, holdPartij, HOLD_PARTIJ_NAAM } from "./on-hold";
import { actieWie, caseNr, dagenTekst, fmtDatum, type CaseItem, type Partij } from "./to-rondes";
import { dagenZonderHold } from "./on-hold";

export type AandachtSoort = "hervatten" | "afkeur" | "afronden";
export type AandachtItem = {
  soort: AandachtSoort; c: CaseItem; casenummer: string;
  /** Concrete volgende actie. */
  actie: string;
  /** Casepartij ("Bal bij") volgens casePresentatie. */
  balBij: string;
  /** Onderliggende actiehouder, alleen als die afwijkt van de casepartij. */
  actieBij?: string;
  datum: string;
  dagen: number;
};

const dagNr = (d: string) => Math.floor(new Date(d.slice(0, 10) + "T00:00:00Z").getTime() / 86400000);
export const SOORT_TITEL: Record<AandachtSoort, string> = { hervatten: "Hervatten nodig", afkeur: "Afkeur oplossen", afronden: "Dossier afronden" };

/** `nu` is de kalenderdag in Europe/Amsterdam (YYYY-MM-DD). */
export function aandachtItems(cases: CaseItem[], nu = amsterdamDatum()): AandachtItem[] {
  const uit: AandachtItem[] = [];
  for (const c of cases) {
    const s = c.station;
    const p = casePresentatie(c);
    const balBij = p.partijen.join(", ") || "—";
    const nr = caseNr(s);
    if (s.on_hold) {
      // Te laat alleen als de hervatdatum vóór vandaag (Amsterdam) ligt; vandaag of onbekend is niet te laat.
      if (hervattenVoorbij(s, nu)) {
        const over = dagNr(nu) - dagNr(String(s.on_hold_tot));
        uit.push({ soort: "hervatten", c, casenummer: nr, actie: "Hervatten of nieuwe hervatdatum kiezen", balBij: HOLD_PARTIJ_NAAM[holdPartij(s)],
          datum: `hervatten gepland ${holdDatum(String(s.on_hold_tot))} · ${over === 1 ? "1 dag" : `${over} dagen`} verstreken`, dagen: over });
      }
      continue; // on hold: geen andere opvolging tonen, de pauze is leidend
    }
    const r = c.last;
    if (r?.status === "afgekeurd") {
      const open = r.to_acties.filter((a) => !a.afgehandeld_op);
      const sinds = r.reactie_op;
      const dagen = dagenZonderHold(sinds, null, s, nu);
      const datum = sinds ? `afgekeurd ${fmtDatum(sinds)} · ${dagenTekst(dagen)}` : "afkeurdatum onbekend";
      if (open.length) for (const a of open) {
        const wie = actieWie(a);
        uit.push({ soort: "afkeur", c, casenummer: nr, actie: a.omschrijving, balBij, actieBij: p.partijen.includes(a.bij as Partij) && wie === a.bij ? undefined : wie, datum, dagen });
      } else {
        const bal = p.bal[0];
        uit.push({ soort: "afkeur", c, casenummer: nr, actie: `Opnieuw indienen (ronde ${c.rondes.length + 1})`, balBij,
          actieBij: bal && !p.partijen.includes(bal.wie) ? bal.label : undefined, datum, dagen });
      }
    } else if (r?.status === "goedgekeurd" && s.dossier_status !== "afgerond") {
      // TO-goedkeuring is geen afgerond dossier: blijft zichtbaar voor opvolging.
      const dagen = dagenZonderHold(r.reactie_op, null, s, nu);
      uit.push({ soort: "afronden", c, casenummer: nr, actie: `Dossier afronden (nu: ${dossierLabel(s.dossier_status)})`, balBij,
        datum: r.reactie_op ? `TO goedgekeurd ${fmtDatum(r.reactie_op)} · ${dagenTekst(dagen)}` : "goedkeuringsdatum onbekend", dagen });
    }
  }
  const volgorde: AandachtSoort[] = ["hervatten", "afkeur", "afronden"];
  return uit.sort((a, b) => volgorde.indexOf(a.soort) - volgorde.indexOf(b.soort) || b.dagen - a.dagen);
}

export const dossierLabel = (d: string | null | undefined) => d === "afgerond" ? "Afgerond" : d === "volledig" ? "Bevestigd volledig" : "Ingediend";
