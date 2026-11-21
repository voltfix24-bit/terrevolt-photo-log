// Wekelijkse volledige SharePoint-spiegel. Verwerkt stations in kleine batches en roept zichzelf aan voor de volgende batch.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { isBeheerder } from "../_shared/admin-auth.ts";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { Claim, Bezet, stelSyncUit } from "../_shared/verwerking.ts";
import { context, syncEnRegistreer, controleerSleutel, nietSyncReden, syncStation, verplaatsVerwijderd, zetStatus } from "../_shared/sharepoint.ts";

const BATCH = 2;
const Body = z.union([
  z.object({ bron: z.literal("cron") }),
  z.object({ handmatig: z.literal(true) }),
  z.object({ dry_run: z.literal(true), station_id: z.string().uuid().optional() }),
  z.object({ run_id: z.string().uuid(), offset: z.number().int().min(0) }),
]);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const db = () => createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

// Is het nu zondag 01:xx in Amsterdam? (zomer- en wintertijd via Intl)
function isZondagEenUur(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short", hour: "2-digit", hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return p.weekday === "Sun" && Number(p.hour) === 1;
}

async function volgende(runId: string, offset: number) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sharepoint-weekly`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId, offset }),
  });
  await r.body?.cancel();
}

async function batch(runId: string, offset: number) {
  const sb = db();
  const { data: run } = await sb.from("sharepoint_sync_runs").select("*").eq("id", runId).single();
  const tel = { toegevoegd: 0, verwijderd: 0, verplaatst: 0, stations: 0 };
  const fouten: unknown[] = [];
  let klaar = false;
  try {
    if (offset === 0) await controleerSleutel(sb);
    const ctx = await context(sb);
    const { data: stations } = await sb.from("stations").select("*").neq("uitvoerder", "van_gelder").order("created_at").range(offset, offset + BATCH - 1); // Van Gelder: volledig overslaan
    for (const st of stations ?? []) {
      let claim: Claim;
      try { claim = await Claim.neem(sb,st.id); }
      catch(e) {
        await stelSyncUit(sb,st.id,!!nietSyncReden(st),(e as Error).message);
        fouten.push({ station_id: st.id, uitgesteld: true, fout: (e as Error).message });
        continue;
      }
      try {
        if (nietSyncReden(st)) {
          const { data: vorig } = await sb.from("sharepoint_sync").select("sharepoint_item_id").eq("station_id",st.id).maybeSingle();
          if (vorig?.sharepoint_item_id) await zetStatus(await context(sb,true,claim),vorig.sharepoint_item_id,st);
        } else {
          const res = await syncEnRegistreer(sb,st,claim);
          tel.toegevoegd += res.toegevoegd.length; tel.verwijderd += res.verwijderd.length + res.leegVerwijderd.length; tel.verplaatst += res.verplaatst.length;
        }
      } catch(e) {
        fouten.push({ station: st.naam_msr, station_id: st.id, fout: (e as Error).message.slice(0,500) });
        await stelSyncUit(sb,st.id,!!nietSyncReden(st),(e as Error).message);
      } finally { await claim.release().catch(() => {}); }
      tel.stations++;
    }
    if ((stations ?? []).length < BATCH) {
      // Laatste batch: mappen van verwijderde stations naar _Verwijderd
      const { data: rijen } = await sb.from("sharepoint_sync").select("station_id, sharepoint_item_id");
      const { data: bestaand } = await sb.from("stations").select("id");
      const ids = new Set((bestaand ?? []).map((s: any) => s.id));
      for (const r of (rijen ?? []).filter((r: any) => !ids.has(r.station_id))) {
        let deletionClaim: Claim | undefined;
        try {
          deletionClaim = await Claim.neem(sb,r.station_id);
          ctx.claim = deletionClaim;
          if (r.sharepoint_item_id) {
            const res = await verplaatsVerwijderd(ctx, r.sharepoint_item_id, r.station_id);
            tel.verplaatst += res.verplaatst.length; tel.verwijderd += res.leegVerwijderd.length;
          }
          await deletionClaim.check();
          await sb.from("sharepoint_sync").delete().eq("station_id", r.station_id);
        } catch (e) {
          fouten.push({ station_id: r.station_id, fout: `Verplaatsen naar _Verwijderd: ${(e as Error).message.slice(0, 500)}` });
        } finally { await deletionClaim?.release().catch(() => {}); ctx.claim = undefined; }
      }
      klaar = true;
    }
  } catch (e) {
    fouten.push({ fout: (e as Error).message.slice(0, 500) });
    klaar = true;
  }
  await sb.from("sharepoint_sync_runs").update({
    stations: run.stations + tel.stations, toegevoegd: run.toegevoegd + tel.toegevoegd,
    verwijderd: run.verwijderd + tel.verwijderd, verplaatst: run.verplaatst + tel.verplaatst,
    fouten: [...(run.fouten ?? []), ...fouten], ...(klaar ? { klaar_op: new Date().toISOString() } : {}),
  }).eq("id", runId);
  if (!klaar) await volgende(runId, offset + BATCH);
}

async function start(handmatig: boolean) {
  const sb = db();
  const { data: loopt } = await sb.from("sharepoint_sync_runs").select("id").is("klaar_op", null)
    .gte("gestart_op", new Date(Date.now() - 3 * 3600_000).toISOString()).limit(1);
  if (loopt?.length) return json({ ok: true, al_bezig: true, run_id: loopt[0].id });
  const { data: run, error } = await sb.from("sharepoint_sync_runs").insert({ handmatig }).select().single();
  if (error) return json({ error: error.message }, 500);
  // @ts-ignore EdgeRuntime is beschikbaar in Supabase Edge Functions
  EdgeRuntime.waitUntil(batch(run.id, 0));
  return json({ ok: true, run_id: run.id }, 202);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;

  if ("bron" in b || "run_id" in b) {
    const fout = authenticateCronRequest(req);
    if (fout) return fout;
    if ("bron" in b) return isZondagEenUur() ? start(false) : json({ ok: true, overgeslagen: "niet zondag 01:00 in Amsterdam" });
    // @ts-ignore
    EdgeRuntime.waitUntil(batch(b.run_id, b.offset));
    return json({ ok: true }, 202);
  }

  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  if (!(await isBeheerder(req))) return json({ error: "Alleen na de toegangscode" }, 403);
  if ("handmatig" in b) return start(true);

  // Dry-run: rapporteert wat er zou gebeuren, verandert niets
  const sb = db();
  const ctx = await context(undefined,false);
  const uit: unknown[] = [];
  const { data: stations } = b.station_id
    ? await sb.from("stations").select("*").eq("id", b.station_id)
    : await sb.from("stations").select("*").order("created_at");
  for (const st of stations ?? []) {
    if (st.uitvoerder === "van_gelder") continue;
    const reden = nietSyncReden(st);
    if (reden) { uit.push({ station: st.naam_msr, overgeslagen: reden }); continue; }
    const { data: vorig } = await sb.from("sharepoint_sync").select("sharepoint_item_id").eq("station_id", st.id).maybeSingle();
    try { uit.push({ station: st.naam_msr, ...(await syncStation(ctx, sb, st, vorig?.sharepoint_item_id ?? null, true)) }); }
    catch (e) { uit.push({ station: st.naam_msr, fout: (e as Error).message }); }
  }
  return json({ dry_run: true, stations: uit });
});
