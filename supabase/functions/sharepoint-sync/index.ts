import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { context, enc, graph, nietSyncReden, syncStation } from "../_shared/sharepoint.ts";

const Body = z.union([
  z.object({ station_id: z.string().uuid() }),
  z.object({ opruimen_onbekend: z.literal(true) }),
]);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

  if ("opruimen_onbekend" in parsed.data) {
    // Verplaatst alleen de oude map "Onbekende opdrachtgever" naar de SharePoint-prullenbak
    try {
      const ctx = await context();
      const r = await graph(ctx.tok, `${ctx.root}:/${enc([...ctx.prefix, "Onbekende opdrachtgever"].join("/"))}`, { method: "DELETE" }, [404]);
      return json({ ok: true, verwijderd: r.status !== 404 });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }
  const stationId = parsed.data.station_id;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: station } = await db.from("stations").select("*").eq("id", stationId).maybeSingle();
  if (!station) return json({ error: "Station niet gevonden" }, 404);
  const reden = nietSyncReden(station);
  if (reden) return json({ ok: true, overgeslagen: reden });
  const { data: vorig } = await db.from("sharepoint_sync").select("sharepoint_item_id").eq("station_id", stationId).maybeSingle();
  const status = (v: Record<string, unknown>) =>
    db.from("sharepoint_sync").upsert({ station_id: stationId, gesynct_op: new Date().toISOString(), ...v });
  await status({ status: "bezig", fout: null });

  try {
    const ctx = await context();
    const res = await syncStation(ctx, db, station, vorig?.sharepoint_item_id ?? null);
    await status({ status: "gelukt", aantal_bestanden: res.aantal_bestanden, sharepoint_url: res.sharepoint_url, sharepoint_item_id: res.item_id, fout: null });
    return json({ ok: true, ...res });
  } catch (e) {
    const fout = (e as Error).message;
    console.error("sharepoint-sync mislukt:", fout);
    await status({ status: "mislukt", fout: fout.slice(0, 1000) });
    return json({ error: fout }, 500);
  }
});
