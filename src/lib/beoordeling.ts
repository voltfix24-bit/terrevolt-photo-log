// Pure regels voor de fotobeoordeling: filters, werklijst, sneltoetsen en eindcontrole.
export type BeoordeelFoto = {
  id: string; categorie: string; url: string; created_at: string | null;
  review_status: string; review_reden: string | null; review_versie: number;
  afkeur_afgehandeld_op: string | null; afkeur_afgehandeld_toelichting: string | null;
  gps_afstand_m: number | null; scherpte: string | null;
};
export type Eindcontrole = { station_status: string; te_beoordelen: number; open_afkeuren: number; afgehandelde_afkeuren: number; goedgekeurd: number; ontbrekend: string[] };

export const isOpenAfkeur = (f: Pick<BeoordeelFoto, "review_status" | "afkeur_afgehandeld_op">) => f.review_status === "rejected" && !f.afkeur_afgehandeld_op;

export function inFilter(f: BeoordeelFoto, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "nvt") return false;
  if (filter.startsWith("cat:")) return f.categorie === filter.slice(4);
  if (filter === "rejected") return isOpenAfkeur(f);
  if (filter === "historie") return f.review_status === "rejected" && !!f.afkeur_afgehandeld_op;
  return f.review_status === filter;
}

/** Geselecteerde foto valt altijd binnen de zichtbare lijst; anders de eerste, of niets. */
export function geldigeSelectie(lijst: BeoordeelFoto[], id: string | null): string | null {
  if (id && lijst.some((f) => f.id === id)) return id;
  return lijst[0]?.id ?? null;
}

/** Volgende passende foto ná een bevestigde beslissing, binnen de actieve werklijst. */
export function volgendeNaBesluit(lijst: BeoordeelFoto[], huidig: string, nieuw: BeoordeelFoto, filter: string): string | null {
  const idx = lijst.findIndex((f) => f.id === huidig);
  const naBesluit = lijst.map((f) => (f.id === huidig ? nieuw : f)).filter((f) => inFilter(f, filter));
  if (idx < 0) return naBesluit[0]?.id ?? null;
  const verder = lijst.slice(idx + 1).find((f) => f.id !== huidig && naBesluit.some((n) => n.id === f.id));
  if (verder) return verder.id;
  // Huidige blijft zichtbaar en is de laatste: blijf op een andere nog te beoordelen foto of eindig.
  const ervoor = [...lijst.slice(0, idx)].reverse().find((f) => naBesluit.some((n) => n.id === f.id) && f.review_status === "pending");
  if (ervoor) return ervoor.id;
  return naBesluit.some((f) => f.id === huidig) ? huidig : naBesluit[0]?.id ?? null;
}

/** Sneltoetsen alleen zonder modifier/IME/herhaling en buiten invoervelden, dialogen en andere knoppen. */
export function sneltoetsToegestaan(e: Pick<KeyboardEvent, "key" | "repeat" | "isComposing" | "ctrlKey" | "metaKey" | "altKey" | "target">, regio: Element | null, dialoogOpen: boolean): boolean {
  if (dialoogOpen || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.key === "Process") return false;
  const t = e.target as HTMLElement | null;
  if (!t || typeof t.closest !== "function") return true;
  if (t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']")) return false;
  if (t === document.body || t === document.documentElement) return true;
  return !!regio && regio.contains(t);
}

export function eindcontroleOk(c: Eindcontrole | undefined | null): boolean {
  return !!c && c.station_status === "opgeleverd" && c.te_beoordelen === 0 && c.open_afkeuren === 0 && c.ontbrekend.length === 0;
}

export function rpcFoutTekst(reden: string | undefined): string {
  switch (reden) {
    case "gewijzigd": return "Een collega heeft deze foto intussen gewijzigd. De lijst is ververst; controleer de foto opnieuw.";
    case "niet_eigen": return "Je kunt alleen je eigen laatste beslissing in deze beheersessie herstellen.";
    case "al_hersteld": return "Deze beslissing is al hersteld.";
    case "dossierstatus": return "Het dossier is niet (meer) in beoordeling. Ververs de pagina.";
    case "niet_gevonden": return "Deze foto bestaat niet meer. De lijst is ververst.";
    case "geen_open_afkeur": return "Deze afkeur is al afgehandeld.";
    default: return "Opslaan is niet gelukt. Probeer het opnieuw.";
  }
}
