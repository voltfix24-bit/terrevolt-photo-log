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
import { verwerk } from "../_shared/keten-worker.ts";
import { LEASE_SECONDEN, beslis, foutPatch, handmatigOpnieuw, type Run } from "../_shared/opleverketen.ts";
import { Claim, Bezet } from "../_shared/verwerking.ts";
import { ketenKick } from "../_shared/keten-kick.ts";

const Body = z.object({ actie: z.enum(["tick", "status", "retry"]), station_id: z.string().uuid().optional() });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const db = () => createClient((Deno.env.get("SUPABASE_URL") ?? ""), (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""));
const ACTIEF = "(afgerond,mislukt)";
const PUBLIEK = "id, station_id, status, retry_stap, poging, volgende_poging_op, fout, stap_fouten, gestart_op, bijgewerkt_op, afgerond_op";

async function actieveRuns(sb: any, stationId?: string) {
  const { data,error } = await sb.rpc("uitvoerbare_opleverruns", { _station_id: stationId ?? null, _limiet: 20 });
  if (error) throw error;
  return data ?? [];
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
      const { data: deferred, error: deferredError } = await sb.from("sharepoint_wachtrij").select("station_id, alleen_status").lte("volgende_poging_op",new Date().toISOString()).order("volgende_poging_op").limit(20);
      if (deferredError) throw deferredError;
      for (const task of deferred ?? []) {
        const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sharepoint-sync`, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}`, "Content-Type": "application/json" }, body: JSON.stringify(task), signal: AbortSignal.timeout(45000) }).catch(() => null);
        await response?.body?.cancel();
      }
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
      const { data: geraakt, error } = await sb.rpc("opleverrun_retry", { _id: run.id });
      if (error || geraakt !== true) return json({ error: "Er loopt al een verwerking of de aanvraag is gewijzigd" },409);
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
