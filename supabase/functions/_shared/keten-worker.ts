import { nietSyncReden, syncEnRegistreer } from "./sharepoint.ts";
import { beslis, foutPatch } from "./opleverketen.ts";
import { Claim, Bezet } from "./verwerking.ts";
async function observeer(sb: any, run: any) {
  const { data: station, error: stationError } = await sb.from("stations").select("*").eq("id",run.station_id).maybeSingle();
  if (stationError) throw stationError;
  const { data: pdf, error: pdfError } = await sb.from("rapport_pdf").select("status, gestart_op, fout, geaccepteerde_run, pdf_pad").eq("station_id",run.station_id).maybeSingle();
  if (pdfError) throw pdfError;
  let bestaat = false;
  if (pdf?.geaccepteerde_run === run.id && pdf.pdf_pad === run.pdf_pad && run.pdf_pad) {
    const { data } = await sb.storage.from("rapporten").download(run.pdf_pad);
    bestaat = !!data?.size;
  }
  return { station, obs: {
    station: station ? { status: station.status, uitvoerder: station.uitvoerder } : null,
    htmlAanwezig: !!run.html_pad,
    syncReden: station ? nietSyncReden(station) : null,
    pdf: pdf ? { ...pdf, gestart_op: new Date(pdf.gestart_op).toISOString(), bestaat } : null,
  } };
}

async function startPdf(stationId: string, run: string): Promise<void> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/rapport-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}` },
    body: JSON.stringify({ station_id: stationId, run, keten: true }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.run) throw new Error(`rapport-pdf start mislukt (${r.status})`);
  // The cursor is durable; this request is only a fast wakeup.
}

/** Verwerkt één run zolang er voortgang is. Geeft false als een ander proces de lease heeft. */
export async function verwerk(sb: any, runId: string): Promise<boolean> {
  for (let i=0; i<8; i++) {
    const { data: observed, error: runError } = await sb.from("opleverruns").select("*").eq("id",runId).single();
    if (runError) throw runError;
    if (!observed || ["afgerond","mislukt"].includes(observed.status)) return false;
    const { data: orphan, error: orphanError } = await sb.rpc("opleverrun_verweesd", { _id: runId });
    if (orphanError) throw orphanError;
    if (orphan === true) return true;
    let claim: Claim;
    try { claim = await Claim.neem(sb, observed.station_id, runId); }
    catch (e) { if (e instanceof Bezet) return false; throw e; }
    let run = observed;
    let expected = observed;
    let outside: "html" | "pdf" | null = null;
    try {
      run = await claim.current();
      if (["afgerond","mislukt"].includes(run.status)) return true;
      if (!run.html_pad && ["aangevraagd","voorbereiden"].includes(run.status)) outside = "html";
      else {
        const { station, obs } = await observeer(sb,run);
        // A persisted unfinished PDF step is runnable even if the wakeup was lost.
        const failedPdf = obs.pdf?.status === "mislukt" && new Date(obs.pdf.gestart_op).getTime() === new Date(run.pdf_poging_op ?? 0).getTime();
        const b = run.status === "pdf_bezig" && !run.pdf_pad && !failedPdf ? { actie: "start_pdf" as const } : beslis({ ...run,pdf_run:run.pdf_run ? new Date(run.pdf_run).toISOString() : null },obs,new Date());
        if (b.actie === "niets" || b.actie === "wachten") return true;
        if (b.actie === "update") await claim.save(b.patch);
        if (b.actie === "start_pdf") {
          if (run.status !== "pdf_bezig") await claim.save({ status: "pdf_bezig", fout: null });
          outside = "pdf";
        }
        if (b.actie === "sync_sharepoint") {
          await claim.save({ status: "sharepoint_bezig" });
          try {
            await syncEnRegistreer(sb,station,claim);
            await claim.save({ status: "afgerond", fout: null, poging: 0, afgerond_op: new Date().toISOString() });
          } catch(e) { const now = await claim.current(); if (now.status === "sharepoint_bezig") await claim.cas(now,foutPatch(now,"sharepoint",(e as Error).message,new Date())); }
        }
      }
      expected = await claim.current();
    } finally { await claim.release().catch(() => {}); }
    // Endpoint steps acquire their own short claim: never hold it over a nested call.
    if (outside) {
      try {
        if (outside === "pdf") { await startPdf(run.station_id,runId); return true; }
        const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/oplever-rapport`, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}`, "Content-Type": "application/json" }, body: JSON.stringify({ actie: "voorbereiden", station_id: run.station_id }), signal: AbortSignal.timeout(45000) });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`Rapport voorbereiden mislukt (${response.status})`);
      } catch(e) {
        const c = await Claim.neem(sb,run.station_id,runId);
        try {
          // Wakeup loss/409 never destroys a durable PDF continuation.
          if (outside !== "pdf") await c.cas(expected,foutPatch(expected,"voorbereiden",(e as Error).message,new Date()));
        }
        finally { await c.release().catch(() => {}); }
        return true;
      }
    }
  }
  return true;
}
