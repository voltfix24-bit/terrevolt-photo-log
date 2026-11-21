// Centrale orkestratie van de opleverketen: HTML/station (oplever-rapport) -> PDF (rapport-pdf) -> SharePoint.
// Status persistent in public.opleverruns; één actieve run per station (unieke index); lease via opleverrun_claim.
// tick  : cron (LOVABLE_CRON_SECRET) of interne kick — verwerkt alle runs die aan de beurt zijn.
// status: open, read-only; validated submission and cron drive the machine.
// retry : active PIN grant — handmatig opnieuw na mislukt/wachten.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { isBeheerder } from "../_shared/admin-auth.ts";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { nietSyncReden, syncEnRegistreer } from "../_shared/sharepoint.ts";
import { LEASE_SECONDEN, beslis, foutPatch, handmatigOpnieuw, type Run } from "../_shared/opleverketen.ts";
import { ketenKick } from "../_shared/keten-kick.ts";

const Body = z.object({ actie: z.enum(["tick", "status", "retry"]), station_id: z.string().uuid().optional() });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const db = () => createClient((Deno.env.get("SUPABASE_URL") ?? ""), (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""));
const ACTIEF = "(afgerond,mislukt)";
const PUBLIEK = "id, station_id, status, retry_stap, poging, volgende_poging_op, fout, stap_fouten, gestart_op, bijgewerkt_op, afgerond_op";

async function patch(sb: any, run: Run, lease: string, p: Record<string, unknown>) {
  const { data, error } = await sb.from("opleverruns").update(p).eq("id", run.id).eq("lease_id", lease).select("*").maybeSingle();
  if (error) throw new Error(`run bijwerken mislukt: ${error.message}`);
  if (!data) throw new Error("lease kwijt");
  return data as Run;
}

async function observeer(sb: any, run: Run) {
  const { data: station } = await sb.from("stations").select("*").eq("id", run.station_id).maybeSingle();
  const { data: files } = await sb.storage.from("rapporten").list(run.station_id, { limit: 100 });
  const namen = new Set((files ?? []).map((f: any) => f.name));
  if (!namen.has("rapport.html") && station?.uitvoerder === "terrevolt" && station?.submitted_at) {
    // A direct narrow RPC request/crash after its commit must still produce the HTML.
    const prepared = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/oplever-rapport`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}` },
      body: JSON.stringify({ actie: "voorbereiden", station_id: run.station_id }),
    });
    await prepared.body?.cancel();
    if (!prepared.ok) throw new Error(`Rapport voorbereiden mislukt (${prepared.status})`);
    const { data: confirmed } = await sb.storage.from("rapporten").list(run.station_id, { limit: 100 });
    if ((confirmed ?? []).some((f: any) => f.name === "rapport.html")) namen.add("rapport.html");
  }
  const { data: pdf } = await sb.from("rapport_pdf").select("status, gestart_op, fout").eq("station_id", run.station_id).maybeSingle();
  return {
    station,
    obs: {
      station: station ? { status: station.status, uitvoerder: station.uitvoerder } : null,
      htmlAanwezig: namen.has("rapport.html"),
      syncReden: station ? nietSyncReden(station) : null,
      pdf: pdf ? { ...pdf, gestart_op: new Date(pdf.gestart_op).toISOString(), bestaat: namen.has("rapport.pdf") } : null,
    },
  };
}

async function startPdf(stationId: string): Promise<string> {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/rapport-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}` },
    body: JSON.stringify({ station_id: stationId, keten: true }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.run) throw new Error(`rapport-pdf start mislukt (${r.status})`);
  return new Date(body.run).toISOString();
}

/** Verwerkt één run zolang er voortgang is. Geeft false als een ander proces de lease heeft. */
async function verwerk(sb: any, runId: string): Promise<boolean> {
  const { data: lease, error } = await sb.rpc("opleverrun_claim", { _id: runId, _seconden: LEASE_SECONDEN });
  if (error) throw new Error(`claim mislukt: ${error.message}`);
  if (!lease) return false;
  let { data: run } = await sb.from("opleverruns").select("*").eq("id", runId).single();
  try {
    for (let i = 0; i < 8; i++) {
      const { station, obs } = await observeer(sb, run);
      const b = beslis(run, obs, new Date());
      if (b.actie === "niets" || b.actie === "wachten") break;
      if (b.actie === "update") { run = await patch(sb, run, lease, b.patch); continue; }
      if (b.actie === "start_pdf") {
        try {
          const pdfRun = await startPdf(run.station_id);
          run = await patch(sb, run, lease, { status: "pdf_bezig", pdf_run: pdfRun, fout: null });
        } catch (e) { run = await patch(sb, run, lease, foutPatch(run, "pdf", (e as Error).message, new Date())); }
        break; // PDF loopt op de achtergrond; rapport-pdf kickt ons als hij klaar is
      }
      if (b.actie === "sync_sharepoint") {
        run = await patch(sb, run, lease, { status: "sharepoint_bezig" });
        try {
          await syncEnRegistreer(sb, station);
          run = await patch(sb, run, lease, { status: "afgerond", fout: null, poging: 0, afgerond_op: new Date().toISOString() });
        } catch (e) {
          console.error("keten sharepoint mislukt:", (e as Error).message);
          run = await patch(sb, run, lease, foutPatch(run, "sharepoint", "SharePoint bijwerken mislukt", new Date()));
        }
      }
    }
  } finally {
    await sb.from("opleverruns").update({ lease_id: null, lease_tot: null }).eq("id", runId).eq("lease_id", lease);
  }
  return true;
}

async function actieveRuns(sb: any, stationId?: string) {
  let q = sb.from("opleverruns").select("id, status, volgende_poging_op").not("status", "in", ACTIEF).order("gestart_op").limit(20);
  if (stationId) q = q.eq("station_id", stationId);
  const { data } = await q;
  const nu = Date.now();
  return (data ?? []).filter((r: any) => r.status !== "wacht_op_retry" || !r.volgende_poging_op || new Date(r.volgende_poging_op).getTime() <= nu);
}

async function laatste(sb: any, stationId: string) {
  const { data } = await sb.from("opleverruns").select(PUBLIEK).eq("station_id", stationId).order("gestart_op", { ascending: false }).limit(1).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { actie, station_id } = parsed.data;
  const sb = db();
  try {
    if (actie === "tick") {
      const nee = authenticateCronRequest(req);
      if (nee) return nee;
      const runs = await actieveRuns(sb, station_id);
      let verwerkt = 0;
      for (const r of runs) { try { if (await verwerk(sb, r.id)) verwerkt++; } catch (e) { console.error("run", r.id, (e as Error).message); } }
      return json({ ok: true, kandidaten: runs.length, verwerkt });
    }
    if (!station_id) return json({ error: { station_id: ["verplicht"] } }, 400);
    if (actie === "retry") {
      if (!await isBeheerder(req)) return json({ error: "Beheer vergrendeld of verlopen — ontgrendel opnieuw met de PIN." }, 403);
      const run = await laatste(sb, station_id);
      const p = run ? handmatigOpnieuw(run as Run) : null;
      if (!p) return json({ error: "Niets om opnieuw te proberen" }, 409);
      const { data: geraakt, error } = await sb.from("opleverruns").update(p).eq("id", run.id).or(`lease_tot.is.null,lease_tot.lt.${new Date().toISOString()}`).select("id").maybeSingle();
      if (error || geraakt?.id !== run.id) {
        if (error) console.error("retry mislukt:", error.message);
        return json({ error: error?.code === "23505" || !geraakt ? "Er loopt al een oplevering of de aanvraag is gewijzigd" : "Opnieuw proberen mislukt" }, 409);
      }
      ketenKick(station_id);
      return json({ ok: true, run: await laatste(sb, station_id) });
    }
    // status: fallback-voortzetting als de run aan de beurt is (geen cron nodig om door te lopen)
    // Public status is read-only; processing is driven by the validated submission/cron.
    return json({ ok: true, run: await laatste(sb, station_id) });
  } catch (e) {
    console.error("opleverketen:", (e as Error).message);
    return json({ error: "Opleverstatus niet beschikbaar" }, 500);
  }
});
