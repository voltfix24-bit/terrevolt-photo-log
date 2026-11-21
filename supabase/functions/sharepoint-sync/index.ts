import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { isBeheerder } from "../_shared/admin-auth.ts";
import { Claim, Bezet, stelSyncUit } from "../_shared/verwerking.ts";
import { context, controleerSleutel, nietSyncReden, syncEnRegistreer, zetStatus, verwijderMapping } from "../_shared/sharepoint.ts";

import { stationOntbreekt } from "../_shared/bron-read.ts";

const Body = z.union([
  z.object({ station_id: z.string().uuid(), alleen_status: z.boolean().optional() }),
  z.object({ controle: z.literal(true) }),
]);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

  const machine = authenticateCronRequest(req) === null;
  if (!machine && !await isBeheerder(req)) return json({ error: "Beheer vergrendeld of verlopen — ontgrendel opnieuw met de PIN." }, 403);
  const db = createClient((Deno.env.get("SUPABASE_URL") ?? ""), (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""));
  if ("controle" in parsed.data) {
    if (!(await isBeheerder(req))) return json({ error: "Alleen na de toegangscode" }, 403);
    // Sleutel + machtigingen controleren (knop in Instellingen)
    const sleutel = await controleerSleutel(db);
    try { await context(db); } catch (e) { console.error((e as Error).message); }
    const { data } = await db.from("instellingen").select("sp_sleutel_verloopt_op, sp_sleutel_automatisch, sp_auth_fout, sp_machtigingen_nodig").limit(1).maybeSingle();
    return json({ ok: true, ...data, sleutel });
  }
  const stationId = parsed.data.station_id;
  const { data: station, error: stationError } = await db.from("stations").select("*").eq("id", stationId).maybeSingle();
  if (stationError) return json({ error:"Station niet gelezen — geen wijzigingen uitgevoerd" },500);
  if (!station) {
    const { data: old, error: oldError } = await db.from("sharepoint_sync").select("sharepoint_item_id").eq("station_id",stationId).maybeSingle();
    if (oldError) return json({ error:"SharePoint-koppeling niet gelezen" },500);
    if (!old?.sharepoint_item_id) return json({ error: "Station niet gevonden" },404);
    let deletedClaim: Claim;
    try { deletedClaim = await Claim.neem(db,stationId); }
    catch(e) { await stelSyncUit(db,stationId,false,(e as Error).message); return json({ uitgesteld: true },409); }
    try {
      if (!await stationOntbreekt(db,stationId)) return json({ error:"Station bestaat inmiddels weer" },409);
      const result = await verwijderMapping(await context(undefined,false,deletedClaim),db,stationId,old.sharepoint_item_id,deletedClaim);
      if (!result) return json({ error:"Station bestaat inmiddels weer; geen verplaatsing" },409);
      await deletedClaim.queueDone();
      return json({ ok: true });
    } catch(e) { await stelSyncUit(db,stationId,false,(e as Error).message); return json({ error: "Verplaatsing uitgesteld" },500); }
    finally { await deletedClaim.release().catch(() => {}); }
  }
  if (station.uitvoerder !== "terrevolt") return json({ ok: true, overgeslagen: "uitvoering Van Gelder" });
  let claim: Claim;
  try { claim = await Claim.neem(db,stationId); }
  catch(e) {
    if (!(e instanceof Bezet)) throw e;
    await stelSyncUit(db,stationId,parsed.data.alleen_status ?? false);
    return json({ ok: false, uitgesteld: true, error: "Station wordt verwerkt; synchronisatie staat in de wachtrij" },409);
  }
  try {
    if (parsed.data.alleen_status) {
      const { data: r, error: mappingError } = await db.from("sharepoint_sync").select("sharepoint_item_id").eq("station_id",stationId).maybeSingle();
      if (mappingError) throw mappingError;
      if (!r?.sharepoint_item_id) { await claim.queueDone(true); return json({ ok: true, overgeslagen: "niet in SharePoint" }); }
      const n = await zetStatus(await context(db,true,claim),r.sharepoint_item_id,station);
      await claim.check();
      await claim.queueDone(true);
      return json({ ok: true, bijgewerkt: n });
    }
    const reden = nietSyncReden(station);
    if (reden) { await claim.queueDone(); return json({ ok: true, overgeslagen: reden }); }
    const res = await syncEnRegistreer(db,station,claim);
    await claim.check();
    await claim.queueDone();
    return json({ ok: true, ...res });
  } catch(e) {
    await stelSyncUit(db,stationId,parsed.data.alleen_status ?? false,(e as Error).message);
    console.error("sharepoint-sync mislukt:",(e as Error).message);
    return json({ error: "Synchronisatie mislukt; opnieuw proberen staat in de wachtrij" },500);
  } finally { await claim.release().catch(() => {}); }
});
