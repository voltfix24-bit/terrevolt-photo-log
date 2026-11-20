import { describe, expect, it } from "vitest";
import { MAX_POGINGEN, BACKOFF_PLAFOND_MS, PDF_VASTGELOPEN_MS, backoffMs, beslis, foutPatch, handmatigOpnieuw, type Observatie, type Run } from "../../supabase/functions/_shared/opleverketen";
import { ketenWeergave } from "@/lib/opleverketen";

const run = (p: Partial<Run> = {}): Run => ({ id: "r", station_id: "s", status: "aangevraagd", retry_stap: null, poging: 0, volgende_poging_op: null, pdf_run: null, fout: null, stap_fouten: {}, ...p });
const nu = new Date("2026-11-20T12:00:00Z");
const PDFRUN = "2026-11-20T11:59:00.000Z";
const obs = (p: Partial<Observatie> = {}): Observatie => ({ station: { status: "opgeleverd" }, htmlAanwezig: true, syncReden: null, pdf: null, ...p });

// Kleine simulator van de orchestrator-lus met nep-diensten, inclusief "één actieve run per station"
function simuleer(opts: { pdf: () => "klaar" | "mislukt" | "geen_bestand"; sp: () => boolean; syncReden?: string | null }) {
  let r = run(); let t = nu.getTime(); let pdf: Observatie["pdf"] = null; const log: string[] = [];
  for (let i = 0; i < 60 && r.status !== "afgerond" && r.status !== "mislukt"; i++) {
    const b = beslis(r, obs({ pdf, syncReden: opts.syncReden ?? null }), new Date(t), 1);
    if (b.actie === "update") r = { ...r, ...b.patch } as Run;
    else if (b.actie === "start_pdf") { const u = opts.pdf(); pdf = { status: u === "mislukt" ? "mislukt" : "klaar", gestart_op: PDFRUN, bestaat: u === "klaar" }; r = { ...r, status: "pdf_bezig", pdf_run: PDFRUN }; log.push("pdf"); }
    else if (b.actie === "sync_sharepoint") { log.push("sp"); r = opts.sp() ? { ...r, status: "afgerond" } : { ...r, ...foutPatch(r, "sharepoint", "fout", new Date(t), 1) } as Run; }
    else if (b.actie === "wachten") { if (r.status === "wacht_op_casegegevens") break; t += BACKOFF_PLAFOND_MS; }
  }
  return { r, log };
}

describe("opleverketen", () => {
  it("succes: HTML bevestigd -> PDF -> SharePoint -> afgerond", () => {
    const { r, log } = simuleer({ pdf: () => "klaar", sp: () => true });
    expect(r.status).toBe("afgerond"); expect(log).toEqual(["pdf", "sp"]);
  });
  it("PDF-fout: opnieuw met backoff, na plafond mislukt met foutstap pdf", () => {
    const { r, log } = simuleer({ pdf: () => "mislukt", sp: () => true });
    expect(r.status).toBe("mislukt"); expect(r.retry_stap).toBe("pdf"); expect(log.filter((x) => x === "pdf")).toHaveLength(MAX_POGINGEN); expect(log).not.toContain("sp");
  });
  it("PDF 'klaar' zonder bestand telt niet als klaar", () => {
    const b = beslis(run({ status: "pdf_bezig", pdf_run: PDFRUN }), obs({ pdf: { status: "klaar", gestart_op: PDFRUN, bestaat: false } }), nu, 1);
    expect(b.actie === "update" && b.patch.status).toBe("wacht_op_retry");
  });
  it("SharePoint-fout: PDF blijft klaar, alleen SharePoint wordt opnieuw geprobeerd tot mislukt", () => {
    const { r, log } = simuleer({ pdf: () => "klaar", sp: () => false });
    expect(r.status).toBe("mislukt"); expect(r.stap_fouten.sharepoint).toBe("fout");
    expect(log.filter((x) => x === "pdf")).toHaveLength(1); expect(log.filter((x) => x === "sp")).toHaveLength(MAX_POGINGEN);
  });
  it("tijdelijke fout herstelt bij volgende poging", () => {
    let n = 0; const { r } = simuleer({ pdf: () => "klaar", sp: () => ++n > 2 });
    expect(r.status).toBe("afgerond"); expect(n).toBe(3);
  });
  it("wacht_op_retry wacht tot volgende_poging_op", () => {
    const r = run({ status: "wacht_op_retry", retry_stap: "sharepoint", volgende_poging_op: new Date(nu.getTime() + 1000).toISOString() });
    expect(beslis(r, obs(), nu).actie).toBe("wachten");
    const b = beslis(r, obs(), new Date(nu.getTime() + 2000));
    expect(b.actie === "update" && b.patch.status).toBe("pdf_klaar");
  });
  it("vastgelopen PDF (crash/timeout) wordt na drempel hersteld", () => {
    const r = run({ status: "pdf_bezig", pdf_run: PDFRUN });
    const p = { status: "bezig", gestart_op: PDFRUN, bestaat: false };
    expect(beslis(r, obs({ pdf: p }), nu).actie).toBe("wachten");
    const b = beslis(r, obs({ pdf: p }), new Date(new Date(PDFRUN).getTime() + PDF_VASTGELOPEN_MS + 1));
    expect(b.actie === "update" && b.patch.status).toBe("wacht_op_retry");
  });
  it("onderbroken SharePoint-sync (lease verlopen) wordt opnieuw geprobeerd", () => {
    const b = beslis(run({ status: "sharepoint_bezig" }), obs(), nu, 1);
    expect(b.actie === "update" && b.patch.retry_stap).toBe("sharepoint");
  });
  it("ontbrekend casenummer/casenaam: wachten zonder retries", () => {
    const { r, log } = simuleer({ pdf: () => "klaar", sp: () => true, syncReden: "case ontbreekt" });
    expect(r.status).toBe("wacht_op_casegegevens"); expect(r.poging).toBe(0); expect(log).toEqual(["pdf"]);
    expect(beslis(r, obs({ syncReden: null }), nu).actie).toBe("sync_sharepoint");
  });
  it("geen PDF-stap als station niet bevestigd opgeleverd is of HTML ontbreekt", () => {
    expect(beslis(run(), obs({ station: { status: "in uitvoering" } }), nu).actie).toBe("update");
    const b = beslis(run(), obs({ htmlAanwezig: false }), nu);
    expect(b.actie === "update" && b.patch.status).toBe("mislukt");
  });
  it("dubbel indienen/handmatig opnieuw: lopende run kan niet opnieuw gestart worden", () => {
    for (const s of ["aangevraagd", "pdf_bezig", "pdf_klaar", "sharepoint_bezig", "afgerond"] as const) expect(handmatigOpnieuw(run({ status: s }))).toBeNull();
    expect(handmatigOpnieuw(run({ status: "mislukt", retry_stap: "sharepoint", poging: 5 }))).toMatchObject({ status: "pdf_klaar", poging: 0 });
  });
  it("backoff groeit exponentieel met jitter en plafond", () => {
    expect(backoffMs(1, 1)).toBe(60_000); expect(backoffMs(3, 1)).toBe(240_000);
    expect(backoffMs(20, 1)).toBe(BACKOFF_PLAFOND_MS); expect(backoffMs(1, 0)).toBe(30_000);
  });
  it("frontend toont nooit 'compleet' zolang de keten niet afgerond is", () => {
    for (const s of ["aangevraagd", "pdf_bezig", "pdf_klaar", "sharepoint_bezig", "wacht_op_retry", "wacht_op_casegegevens", "mislukt"]) {
      const w = ketenWeergave({ ...run({ status: s as Run["status"] }), gestart_op: PDFRUN, afgerond_op: null });
      expect(w?.toon).not.toBe("goed");
    }
    expect(ketenWeergave({ ...run({ status: "mislukt", retry_stap: "pdf", fout: "x" }), gestart_op: PDFRUN, afgerond_op: null })).toMatchObject({ toon: "fout", retry: true });
    expect(ketenWeergave({ ...run({ status: "afgerond" }), gestart_op: PDFRUN, afgerond_op: PDFRUN })?.toon).toBe("goed");
  });
});
