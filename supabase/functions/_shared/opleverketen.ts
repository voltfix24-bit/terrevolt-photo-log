// Pure toestandsmachine van de opleverketen (geen imports: ook door Vitest getest via src/test/opleverketen.test.ts).
// Volgorde: aangevraagd -> pdf_bezig -> pdf_klaar -> sharepoint_bezig -> afgerond.
// Fouten: wacht_op_retry (backoff + jitter, plafond) -> na MAX_POGINGEN mislukt. Ontbrekende case: wacht_op_casegegevens (geen retries).

export type KetenStatus =
  | "aangevraagd" | "voorbereiden" | "pdf_bezig" | "pdf_klaar" | "sharepoint_bezig"
  | "wacht_op_retry" | "wacht_op_casegegevens" | "afgerond" | "mislukt";
export type Stap = "voorbereiden" | "pdf" | "sharepoint";

export const EINDSTATUSSEN: KetenStatus[] = ["afgerond", "mislukt"];
export const MAX_POGINGEN = 5;
export const BACKOFF_BASIS_MS = 60_000;
export const BACKOFF_PLAFOND_MS = 30 * 60_000;
export const PDF_VASTGELOPEN_MS = 30 * 60_000;
export const LEASE_SECONDEN = 300;

export interface Run {
  id: string;
  station_id: string;
  status: KetenStatus;
  retry_stap: Stap | null;
  poging: number;
  volgende_poging_op: string | null;
  pdf_run: string | null;
  fout: string | null;
  stap_fouten: Record<string, string>;
}
export interface Observatie {
  station: { status: string | null; uitvoerder?: string | null } | null;
  htmlAanwezig: boolean;
  /** Uitkomst van nietSyncReden(station) uit _shared/sharepoint.ts */
  syncReden: string | null;
  pdf: { status: string; gestart_op: string; bestaat: boolean; fout?: string | null } | null;
}
export type Besluit =
  | { actie: "niets" }
  | { actie: "wachten" }
  | { actie: "update"; patch: Partial<Run> & { afgerond_op?: string } }
  | { actie: "start_pdf" }
  | { actie: "sync_sharepoint" };

export function backoffMs(poging: number, rnd: number = Math.random()): number {
  const ruw = Math.min(BACKOFF_PLAFOND_MS, BACKOFF_BASIS_MS * 2 ** Math.max(0, poging - 1));
  return Math.round(ruw * (0.5 + 0.5 * rnd)); // jitter 50–100%
}

/** Fout in een stap: opnieuw proberen met backoff, of definitief mislukt na MAX_POGINGEN. */
export function foutPatch(run: Run, stap: Stap, melding: string, nu: Date, rnd?: number, definitief = false): Partial<Run> & { afgerond_op?: string } {
  const poging = run.poging + 1;
  const stap_fouten = { ...run.stap_fouten, [stap]: melding.slice(0, 500) };
  if (definitief || poging >= MAX_POGINGEN) {
    return { status: "mislukt", poging, fout: melding.slice(0, 500), stap_fouten, retry_stap: stap, volgende_poging_op: null, afgerond_op: nu.toISOString() };
  }
  return { status: "wacht_op_retry", poging, retry_stap: stap, fout: melding.slice(0, 500), stap_fouten, volgende_poging_op: new Date(nu.getTime() + backoffMs(poging, rnd)).toISOString() };
}

export function beslis(run: Run, obs: Observatie, nu: Date, rnd?: number): Besluit {
  switch (run.status) {
    case "afgerond":
    case "mislukt":
      return { actie: "niets" };
    case "wacht_op_retry":
      if (run.volgende_poging_op && new Date(run.volgende_poging_op) > nu) return { actie: "wachten" };
      return { actie: "update", patch: { status: run.retry_stap === "sharepoint" ? "pdf_klaar" : "aangevraagd", volgende_poging_op: null } };
    case "aangevraagd":
    case "voorbereiden":
      if (!obs.station) return { actie: "update", patch: foutPatch(run, "voorbereiden", "Station niet gevonden", nu, rnd, true) };
      if (obs.station.uitvoerder === "van_gelder") return { actie: "update", patch: foutPatch(run, "voorbereiden", "Uitvoering Van Gelder: geen oplevering", nu, rnd, true) };
      if (obs.station.status !== "opgeleverd" && obs.station.status !== "goedgekeurd")
        return { actie: "update", patch: foutPatch(run, "voorbereiden", "Station staat niet (meer) op opgeleverd", nu, rnd, true) };
      if (!obs.htmlAanwezig) return { actie: "update", patch: foutPatch(run, "voorbereiden", "Rapport (HTML) ontbreekt", nu, rnd, true) };
      return { actie: "start_pdf" };
    case "pdf_bezig": {
      const pdf = obs.pdf;
      if (!pdf || pdf.gestart_op !== run.pdf_run) {
        // Andere/onbekende PDF-run: alleen ingrijpen als het te lang duurt
        return { actie: "update", patch: foutPatch(run, "pdf", "PDF-run niet gevonden", nu, rnd) };
      }
      if (pdf.status === "klaar") {
        if (!pdf.bestaat) return { actie: "update", patch: foutPatch(run, "pdf", "PDF staat niet in de opslag", nu, rnd) };
        return { actie: "update", patch: { status: "pdf_klaar", poging: 0, fout: null } };
      }
      if (pdf.status === "mislukt") return { actie: "update", patch: foutPatch(run, "pdf", pdf.fout || "PDF maken mislukt", nu, rnd) };
      if (nu.getTime() - new Date(pdf.gestart_op).getTime() > PDF_VASTGELOPEN_MS)
        return { actie: "update", patch: foutPatch(run, "pdf", "PDF maken vastgelopen", nu, rnd) };
      return { actie: "wachten" };
    }
    case "pdf_klaar":
    case "wacht_op_casegegevens":
      if (obs.syncReden === "case ontbreekt") {
        return run.status === "wacht_op_casegegevens" ? { actie: "wachten" }
          : { actie: "update", patch: { status: "wacht_op_casegegevens", fout: "Casenummer of casenaam ontbreekt" } };
      }
      if (obs.syncReden) return { actie: "update", patch: foutPatch(run, "sharepoint", `Niet naar SharePoint: ${obs.syncReden}`, nu, rnd, true) };
      return { actie: "sync_sharepoint" };
    case "sharepoint_bezig":
      // Alleen bereikbaar na een crash midden in de sync (lease verlopen): opnieuw proberen
      return { actie: "update", patch: foutPatch(run, "sharepoint", "SharePoint-sync onderbroken", nu, rnd) };
  }
  return { actie: "niets" };
}

/** Handmatig opnieuw: alleen bij mislukt of wachtend; zet de run terug op de mislukte stap met verse pogingen. */
export function handmatigOpnieuw(run: Run): (Partial<Run> & { afgerond_op?: null }) | null {
  if (run.status !== "mislukt" && run.status !== "wacht_op_retry" && run.status !== "wacht_op_casegegevens") return null;
  const stap = run.status === "wacht_op_casegegevens" ? "sharepoint" : run.retry_stap;
  return { status: stap === "sharepoint" ? "pdf_klaar" : "aangevraagd", poging: 0, volgende_poging_op: null, afgerond_op: null };
}
