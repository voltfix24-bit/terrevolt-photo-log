// Weergave van de centrale opleverketen (status uit public.opleverruns, via edge function opleverketen).
export type KetenRun = {
  id: string; station_id: string; status: string; retry_stap: string | null; poging: number;
  volgende_poging_op: string | null; fout: string | null; stap_fouten: Record<string, string> | null;
  gestart_op: string; afgerond_op: string | null;
};
export type KetenWeergave = { titel: string; tekst: string; toon: "bezig" | "goed" | "wacht" | "fout"; retry: boolean; actief: boolean };

const STAP_NAAM: Record<string, string> = { voorbereiden: "Indienen", pdf: "Rapport maken", sharepoint: "SharePoint bijwerken" };

/** Toont alleen "Alles klaar" als de run echt afgerond is; elke andere status blijft zichtbaar als bezig/wacht/fout. */
export function ketenWeergave(run: KetenRun | null | undefined): KetenWeergave | null {
  if (!run) return null;
  const stap = STAP_NAAM[run.retry_stap ?? ""] ?? "Oplevering";
  switch (run.status) {
    case "aangevraagd":
    case "voorbereiden":
    case "pdf_bezig":
      return { titel: "Dossier ingediend", tekst: "Rapport wordt gemaakt, daarna wordt SharePoint bijgewerkt.", toon: "bezig", retry: false, actief: true };
    case "pdf_klaar":
    case "sharepoint_bezig":
      return { titel: "Rapport klaar", tekst: "SharePoint wordt bijgewerkt.", toon: "bezig", retry: false, actief: true };
    case "wacht_op_retry":
      return { titel: `${stap} lukte niet`, tekst: `Wordt automatisch opnieuw geprobeerd${run.volgende_poging_op ? ` om ${new Date(run.volgende_poging_op).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}` : ""} (poging ${run.poging}).${run.fout ? ` ${run.fout}.` : ""}`, toon: "wacht", retry: true, actief: true };
    case "wacht_op_casegegevens":
      return { titel: "Rapport klaar", tekst: "Wacht op casenummer en casenaam voordat het naar SharePoint kan.", toon: "wacht", retry: true, actief: true };
    case "mislukt":
      return { titel: `${stap} mislukt`, tekst: run.fout ? `${run.fout}.` : "Probeer het opnieuw.", toon: "fout", retry: true, actief: false };
    case "afgerond":
      return { titel: "Oplevering compleet", tekst: "Rapport gemaakt en SharePoint bijgewerkt.", toon: "goed", retry: false, actief: false };
  }
  return { titel: "Onbekende status", tekst: run.status, toon: "wacht", retry: false, actief: false };
}

/** Handmatige SharePoint-sync mag alleen als er geen opleverrun actief is (anders kan hij parallel lopen met de keten). */
export function handmatigeSyncToegestaan(run: Pick<KetenRun, "status"> | null | undefined): boolean {
  return !run || run.status === "afgerond" || run.status === "mislukt";
}

/** Uitkomst van sharepoint-sync vertalen: alleen een bevestigde sync is succes. */
export function syncUitkomst(data: unknown, error: unknown): "gelukt" | "overgeslagen" | "bezig" | "mislukt" {
  if (error) {
    const status = (error as { context?: { status?: number } })?.context?.status;
    return status === 409 ? "bezig" : "mislukt";
  }
  const d = data as { ok?: boolean; overgeslagen?: string } | null;
  if (d?.ok !== true) return "mislukt";
  return d.overgeslagen ? "overgeslagen" : "gelukt";
}
