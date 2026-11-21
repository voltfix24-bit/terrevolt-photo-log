// Leest de map "10 Documenten" van een case in SharePoint en geeft tijdelijke download-links (geen Microsoft-login nodig).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { context, documentenLijst, documentenMap, downloadUrl } from "../_shared/sharepoint.ts";

const Body = z.object({ station_id: z.string().uuid(), bestand_id: z.string().min(1).max(200).optional() });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { station_id, bestand_id } = parsed.data;

  try {
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: r, error: readError } = await db.from("sharepoint_sync").select("sharepoint_item_id").eq("station_id", station_id).maybeSingle();
    if (readError) throw readError;
    if (!r?.sharepoint_item_id) return json({ heeft_map: false, bestanden: [] });
    const ctx = await context(undefined, false);
    const mapId = await documentenMap(ctx, r.sharepoint_item_id);
    if (!mapId) return json({ heeft_map: false, bestanden: [] });
    if (bestand_id) return json({ url: await downloadUrl(ctx, mapId, bestand_id) });
    return json({ heeft_map: true, bestanden: await documentenLijst(ctx, mapId) });
  } catch (e) {
    console.error("sharepoint-documenten:", (e as Error).message);
    return json({ error: "Documenten niet beschikbaar" }, 500);
  }
});
