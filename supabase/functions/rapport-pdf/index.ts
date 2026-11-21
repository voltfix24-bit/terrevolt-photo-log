import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { isBeheerder } from "../_shared/admin-auth.ts";
import { Claim } from "../_shared/verwerking.ts";
import { ketenKick } from "../_shared/keten-kick.ts";
import { Body, json, db, voorbereiden } from "./renderer.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { station_id, stap, run, keten } = parsed.data;
  const machine = authenticateCronRequest(req) === null;
  if (!machine && (stap !== undefined || run !== undefined || keten !== undefined || !await isBeheerder(req))) return json({ error: "Beheer vergrendeld of verlopen — ontgrendel opnieuw met de PIN." }, 403);
  const { data: station, error: stationError } = await db().from("stations").select("status, uitvoerder, submitted_at").eq("id", station_id).maybeSingle();
  if (stationError) return json({ error:"Station kon niet worden gelezen" },500);
  if (!station || station.uitvoerder !== "terrevolt" || !station.submitted_at) return json({ error: "Geen opgeleverd fotodossier" }, 409);
  const sb = db();
  let r = run;
  if (!r) {
    // Manual PDF requests use the same atomic reservation as ordinary delivery.
    if (!machine) {
      const caller = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
      const { data, error } = await caller.rpc("fotodossier_aanbieden", { _station_id: station_id });
      if (error || !data?.id) return json({ error: "Oplevering reserveren mislukt" },409);
      await ketenKick(station_id);
      return json({ ok: true, status: "bezig", run: data.id },202);
    }
    const { data: active, error: activeError } = await sb.from("opleverruns").select("id").eq("station_id",station_id).not("status","in","(afgerond,mislukt)").maybeSingle();
    if (activeError) return json({ error:"Actieve PDF-run kon niet worden gelezen" },500);
    r = active?.id;
  }
  if (!r) return json({ error: "Geen PDF-run" },409);
  let claim: Claim;
  try { claim = await Claim.neem(sb, station_id, r); }
  catch (e) { return json({ error: (e as Error).message },409); }
  try {
    const current = await claim.current();
    if (["afgerond","mislukt"].includes(current.status) || current.pdf_pad) return json({ ok:true,status:current.status,run:r });
    if (current.status !== "pdf_bezig") return json({ error:"PDF-stap is nog niet uitvoerbaar" },409);
  } finally { await claim.release().catch(() => {}); }
  // @ts-ignore EdgeRuntime is available on the hosted runtime
  EdgeRuntime.waitUntil(voorbereiden(station_id, r, stap ?? 0, keten ?? true));
  return json({ ok: true, status: "bezig", run: r }, 202);
});
