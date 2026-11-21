import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { z } from "npm:zod@3";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { Claim, Bezet, revisiePad, immutableUpload, toetsDossier } from "../_shared/verwerking.ts";
import { ketenKick } from "../_shared/keten-kick.ts";

const Body = z.object({
  actie: z.enum(["submit", "rapport-url", "voorbereiden"]).optional(),
  station_id: z.string().uuid(),
  opdrachtgever: z.string().trim().max(200).nullish(),
  submitted_by: z.string().trim().max(200).nullish(),
});
const fout = (status: number, error: unknown) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const escape = (value: unknown) =>
  String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] as string));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") return fout(405, "Alleen POST");
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return fout(401, "Unauthorized");
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fout(400, parsed.error.flatten().fieldErrors);

  try {
    const supabase = createClient(
      (Deno.env.get("SUPABASE_URL") ?? ""),
      (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""),
    );

    const body = parsed.data;
    const actie = body.actie ?? "submit";
    const stationId = body.station_id;

    if (actie === "rapport-url") {
      const { data: station } = await supabase.from("stations").select("id, uitvoerder").eq("id", stationId).single();
      if (!station) throw new Error("Station niet gevonden");
      if (station.uitvoerder === "van_gelder") return fout(409, "Geen rapport voor uitvoering Van Gelder");
      const { data: pdf } = await supabase.from("rapport_pdf").select("status, pdf_pad, geaccepteerde_run").eq("station_id", stationId).maybeSingle();
      const { data: latest } = await supabase.from("opleverruns").select("id,html_pad").eq("station_id",stationId).order("gestart_op",{ ascending:false }).limit(1).maybeSingle();
      const { data: legacy } = !pdf?.pdf_pad ? await supabase.storage.from("rapporten").download(`${stationId}/rapport.pdf`) : { data:null };
      const pad = pdf?.pdf_pad ?? (legacy?.size ? `${stationId}/rapport.pdf` : latest?.html_pad ?? `${stationId}/rapport.html`);
      const { data: signed, error } = await supabase.storage.from("rapporten").createSignedUrl(pad, 60 * 60);
      if (error) throw error;
      return new Response(JSON.stringify({ rapport_url: signed?.signedUrl, pdf_status: pdf?.status ?? null, vorig_rapport: !!pdf?.pdf_pad && pdf.geaccepteerde_run !== latest?.id, type: pad.endsWith(".pdf") ? "pdf" : "html" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward the actual client identity to the narrow SQL transition. An anon
    // mechanic is allowed; arbitrary JWTs and stale PIN grants get no extra rights.
    const caller = createClient((Deno.env.get("SUPABASE_URL") ?? ""), (Deno.env.get("SUPABASE_ANON_KEY") ?? ""), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    let aanvraag: { id: string; nieuw: boolean };
    if (actie === "voorbereiden") {
      if (authenticateCronRequest(req)) return fout(403, "Alleen interne verwerking");
      const { data: active } = await supabase.from("opleverruns").select("id").eq("station_id", stationId).not("status", "in", "(afgerond,mislukt)").limit(1).maybeSingle();
      const { data: st } = await supabase.from("stations").select("submitted_at, uitvoerder").eq("id",stationId).maybeSingle();
      if (!active || !st?.submitted_at || st.uitvoerder !== "terrevolt") return fout(409, "Geen actieve oplevering");
      aanvraag = { id: active.id, nieuw: true };
    } else {
      const { data: result, error: submitError } = await caller.rpc("fotodossier_aanbieden", {
        _station_id: stationId, _opdrachtgever: body.opdrachtgever ?? null, _submitted_by: body.submitted_by ?? null,
      });
      if (submitError || !result?.id) return fout(submitError?.code === "42501" ? 403 : 409,
        submitError?.code === "42501" ? "Beheer vergrendeld of verlopen — ontgrendel opnieuw met de PIN." : "Fotodossier is niet compleet of niet beschikbaar");
      aanvraag = result;
    }
    const { data: run } = await supabase.from("opleverruns").select("id, status, gestart_op").eq("id", aanvraag.id).single();
    if (!run) throw new Error("Oplevering niet gevonden");
    // Existing submitted run: never rewrite files on a repeated public request.
    if (!aanvraag.nieuw) {
      return new Response(JSON.stringify({ ok: true, al_ingediend: true, run }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Public submission reserves only; all preparation is driven by the durable run.
    if (actie !== "voorbereiden") {
      ketenKick(stationId);
      return new Response(JSON.stringify({ ok: true, run }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let claim: Claim;
    try { claim = await Claim.neem(supabase, stationId, aanvraag.id); }
    catch (e) { if (e instanceof Bezet) return fout(409, e.message); throw e; }
    try {
    const dossier = await claim.snapshot();
    toetsDossier(dossier);
    const { station, fotos, opmerkingen, skips, instellingen } = dossier;

    const opdrachtgever = station.opdrachtgever ?? "van Gelder";
    const submittedBy = station.submitted_by ?? station.ingevuld_door ?? "Onbekend";
    const submittedAt = station.submitted_at ?? new Date().toISOString();

    const perCategorie = new Map<string, { url: string }[]>();
    for (const foto of fotos ?? []) {
      const lijst = perCategorie.get(foto.categorie) ?? [];
      lijst.push({ url: foto.url });
      perCategorie.set(foto.categorie, lijst);
    }
    const opmerkingPer = new Map((opmerkingen ?? []).map((item: { categorie: string; opmerking: string }) => [item.categorie, item.opmerking]));

    const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>TO Fotorapport — ${escape(station.naam_msr)}</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;color:#0A2A18;margin:0;padding:32px;background:#fff}
h1{font-size:26px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px;color:#1F5C3A;border-bottom:1px solid #E6EBE5;padding-bottom:6px}
.meta{font-size:13px;color:#5E7A66;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.grid img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px}
.note{font-size:13px;background:#F2F6F1;border-radius:8px;padding:9px 11px;margin-top:8px}
.nvt{font-size:13px;color:#5E7A66;margin:4px 0}
</style></head><body>
<h1>${escape(station.naam_msr)}</h1>
<div class="meta">${escape(instellingen?.bedrijfsnaam ?? "Terrevolt B.V.")} · ${escape(instellingen?.regio ?? "")}<br>
Opgeleverd aan ${escape(opdrachtgever)} door ${escape(submittedBy)} op ${new Date(submittedAt).toLocaleString("nl-NL")}<br>
Behuizingsnummer ${escape(station.behuizingsnummer ?? "-")} · ${escape(station.type_ruimte ?? "-")}</div>
${[...perCategorie.entries()].map(([categorie, items]) => `
<h2>${escape(categorie)}</h2>
<div class="grid">${items.map((item) => `<img src="${escape(item.url)}" alt="${escape(categorie)}">`).join("")}</div>
${opmerkingPer.get(categorie) ? `<div class="note">${escape(opmerkingPer.get(categorie))}</div>` : ""}`).join("")}
${(skips ?? []).length ? `<h2>Niet van toepassing</h2>${(skips ?? []).map((skip: { categorie: string; reden: string }) => `<div class="nvt"><strong>${escape(skip.categorie)}</strong> — ${escape(skip.reden)}</div>`).join("")}` : ""}
</body></html>`;

    const pad = revisiePad(stationId, aanvraag.id, "rapport.html");
    await immutableUpload(supabase, pad, new TextEncoder().encode(html), "text/html", claim);
    await claim.save({ html_pad: pad });
    // Station transition/review reset/run creation were atomically committed by SQL.
    const { data: signed } = await supabase.storage.from("rapporten").createSignedUrl(pad, 60 * 60);

    return new Response(JSON.stringify({ ok: true, run, rapport_url: signed?.signedUrl, submitted_at: submittedAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    } finally { await claim.release().catch(() => {}); }
  } catch (error) {
    const msg = (error as Error).message;
    console.error("oplever-rapport mislukt:", msg);
    return fout(msg === "Station niet gevonden" ? 404 : 500, msg === "Station niet gevonden" ? msg : "Opleveren is mislukt");
  }
});
