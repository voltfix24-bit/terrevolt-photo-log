import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { isBeheerder } from "../_shared/admin-auth.ts";
import { context, controleerSleutel, nietSyncReden, syncStation, zetStatus } from "../_shared/sharepoint.ts";

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

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if ("controle" in parsed.data) {
    if (!(await isBeheerder(req))) return json({ error: "Alleen na de toegangscode" }, 403);
    // Sleutel + machtigingen controleren (knop in Instellingen)
    const sleutel = await controleerSleutel(db);
    try { await context(db); } catch (e) { console.error((e as Error).message); }
    const { data } = await db.from("instellingen").select("sp_sleutel_verloopt_op, sp_sleutel_automatisch, sp_auth_fout, sp_machtigingen_nodig").limit(1).maybeSingle();
    return json({ ok: true, ...data, sleutel });
  }
  const stationId = parsed.data.station_id;
  const { data: station } = await db.from("stations").select("*").eq("id", stationId).maybeSingle();
  if (!station) return json({ error: "Station niet gevonden" }, 404);
  if (parsed.data.alleen_status) {
    // Goed- of afgekeurd: alleen de Status-kolom op bestaande bestanden bijwerken
    const { data: r } = await db.from("sharepoint_sync").select("sharepoint_item_id").eq("station_id", stationId).maybeSingle();
    if (!r?.sharepoint_item_id) return json({ ok: true, overgeslagen: "niet in SharePoint" });
    try { return json({ ok: true, bijgewerkt: await zetStatus(await context(db), r.sharepoint_item_id, station) }); }
    catch (e) { console.error("status bijwerken mislukt:", (e as Error).message); return json({ error: "Status bijwerken mislukt" }, 500); }
  }
  const reden = nietSyncReden(station);
  if (reden) return json({ ok: true, overgeslagen: reden });
  const { data: vorig } = await db.from("sharepoint_sync").select("sharepoint_item_id").eq("station_id", stationId).maybeSingle();
  const status = (v: Record<string, unknown>) =>
    db.from("sharepoint_sync").upsert({ station_id: stationId, gesynct_op: new Date().toISOString(), ...v });
  await status({ status: "bezig", fout: null });

  try {
    const ctx = await context(db);
    const res = await syncStation(ctx, db, station, vorig?.sharepoint_item_id ?? null);
    await status({ status: "gelukt", aantal_bestanden: res.aantal_bestanden, sharepoint_url: res.sharepoint_url, sharepoint_item_id: res.item_id, fout: null });
    return json({ ok: true, ...res });
  } catch (e) {
    const fout = (e as Error).message;
    console.error("sharepoint-sync mislukt:", fout);
    await status({ status: "mislukt", fout: fout.slice(0, 1000) });
    return json({ error: "Synchronisatie mislukt" }, 500);
  }
});
