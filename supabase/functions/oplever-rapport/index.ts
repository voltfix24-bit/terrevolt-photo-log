import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const escape = (value: unknown) =>
  String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] as string));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const actie = body.actie ?? "submit";
    const stationId = body.station_id as string;
    if (!stationId) throw new Error("station_id ontbreekt");

    if (actie === "rapport-url") {
      const { data: station } = await supabase.from("stations").select("id").eq("id", stationId).single();
      if (!station) throw new Error("Station niet gevonden");
      const { data: signed, error } = await supabase.storage
        .from("rapporten")
        .createSignedUrl(`${stationId}/rapport.html`, 60 * 60);
      if (error) throw error;
      return new Response(JSON.stringify({ rapport_url: signed?.signedUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: station }, { data: fotos }, { data: opmerkingen }, { data: skips }, { data: instellingen }] = await Promise.all([
      supabase.from("stations").select("*").eq("id", stationId).single(),
      supabase.from("fotos").select("*").eq("station_id", stationId).order("categorie"),
      supabase.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", stationId),
      supabase.from("categorie_skips").select("categorie, reden").eq("station_id", stationId),
      supabase.from("instellingen").select("bedrijfsnaam, regio, logo_url").limit(1).maybeSingle(),
    ]);

    if (!station) throw new Error("Station niet gevonden");

    const opdrachtgever = body.opdrachtgever ?? station.opdrachtgever ?? "Opdrachtgever";
    const submittedBy = body.submitted_by ?? station.ingevuld_door ?? "Onbekend";
    const submittedAt = new Date().toISOString();

    const perCategorie = new Map<string, { url: string }[]>();
    for (const foto of fotos ?? []) {
      const lijst = perCategorie.get(foto.categorie) ?? [];
      lijst.push({ url: foto.url });
      perCategorie.set(foto.categorie, lijst);
    }
    const opmerkingPer = new Map((opmerkingen ?? []).map((item) => [item.categorie, item.opmerking]));

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
${(skips ?? []).length ? `<h2>Niet van toepassing</h2>${(skips ?? []).map((skip) => `<div class="nvt"><strong>${escape(skip.categorie)}</strong> — ${escape(skip.reden)}</div>`).join("")}` : ""}
</body></html>`;

    const pad = `${stationId}/rapport.html`;
    const { error: uploadError } = await supabase.storage
      .from("rapporten")
      .upload(pad, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html" });
    if (uploadError) throw uploadError;

    await supabase.from("stations").update({
      status: "opgeleverd",
      submitted_at: submittedAt,
      submitted_by: submittedBy,
      opdrachtgever,
      review_reden: null,
    }).eq("id", stationId);

    await supabase.from("fotos").update({ review_status: "pending", review_reden: null }).eq("station_id", stationId).neq("review_status", "approved");

    const { data: signed } = await supabase.storage.from("rapporten").createSignedUrl(pad, 60 * 60);

    return new Response(JSON.stringify({ ok: true, rapport_url: signed?.signedUrl, submitted_at: submittedAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
