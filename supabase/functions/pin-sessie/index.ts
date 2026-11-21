import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { MAX_FOUT, MAX_FOUT_GLOBAAL, pinKlopt, VENSTER_MIN } from "./pin.ts";

// Geeft na een juiste pincode een echte sessie van het beheerdersaccount (rol admin),
// zodat RLS op de server kan controleren. De pincode zelf staat alleen als PBKDF2-hash in ADMIN_PIN_HASH.
const BEHEER_EMAIL = "beheer@to-foto.lovable.app";
const Body = z.object({ pin: z.string().regex(/^\d{4,8}$/), apparaat: z.string().max(64).optional() });
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: "Onjuiste code" }, 400);

  const url = (Deno.env.get("SUPABASE_URL") ?? "");
  const hash = Deno.env.get("ADMIN_PIN_HASH");
  const wachtwoord = Deno.env.get("ADMIN_SESSION_PASSWORD");
  if (!hash || !wachtwoord) { console.error("pin-sessie: secrets ontbreken"); return json({ ok: false, error: "Niet ingesteld" }, 500); }
  const db = createClient(url, (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""), { auth: { persistSession: false } });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "onbekend";
  const sleutel = `${ip}|${parsed.data.apparaat ?? ""}`.slice(0, 200);
  const sinds = new Date(Date.now() - VENSTER_MIN * 60_000).toISOString();
  const [{ count: fout }, { count: foutAlles }] = await Promise.all([
    db.from("pin_pogingen").select("id", { count: "exact", head: true }).eq("sleutel", sleutel).eq("gelukt", false).gte("tijd", sinds),
    db.from("pin_pogingen").select("id", { count: "exact", head: true }).eq("gelukt", false).gte("tijd", sinds),
  ]);
  if (fout === null || foutAlles === null) return json({ ok: false, error: "PIN-controle niet beschikbaar" }, 503);
  if ((fout ?? 0) >= MAX_FOUT || (foutAlles ?? 0) >= MAX_FOUT_GLOBAAL) return json({ ok: false, error: "Te veel pogingen, probeer het over een kwartier opnieuw" }, 429);

  const klopt = await pinKlopt(parsed.data.pin, hash);
  const { error: pogingError } = await db.from("pin_pogingen").insert({ sleutel, gelukt: klopt });
  if (pogingError) return json({ ok: false, error: "PIN-controle niet beschikbaar" }, 503);
  if (!klopt) return json({ ok: false, error: "Onjuiste code" }, 401);

  // Beheerdersaccount aanmaken/herstellen (idempotent), rol toekennen
  let userId: string | null = null;
  const { data: lijst } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const bestaand = lijst?.users.find((u) => u.email === BEHEER_EMAIL);
  if (bestaand) {
    userId = bestaand.id;
    // Never reset the shared password: unlocking must not revoke other devices.
  } else {
    const { data: nieuw, error } = await db.auth.admin.createUser({ email: BEHEER_EMAIL, password: wachtwoord, email_confirm: true });
    if (error || !nieuw.user) { console.error("pin-sessie createUser:", error?.message); return json({ ok: false, error: "Sessie maken mislukt" }, 500); }
    userId = nieuw.user.id;
  }
  const { error: rolErr } = await db.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
  if (rolErr) { console.error("pin-sessie rol:", rolErr.message); return json({ ok: false, error: "Sessie maken mislukt" }, 500); }

  const anon = createClient(url, (Deno.env.get("SUPABASE_ANON_KEY") ?? ""), { auth: { persistSession: false } });
  const { data: sessie, error: inErr } = await anon.auth.signInWithPassword({ email: BEHEER_EMAIL, password: wachtwoord });
  if (inErr || !sessie.session) { console.error("pin-sessie login:", inErr?.message); return json({ ok: false, error: "Sessie maken mislukt" }, 500); }
  // getClaims verifies the newly issued JWT; the browser never supplies session_id.
  const { data: claims, error: claimsError } = await anon.auth.getClaims(sessie.session.access_token);
  const sessionId = claims?.claims?.session_id;
  if (claimsError || typeof sessionId !== "string" || claims?.claims?.sub !== userId) return json({ ok: false, error: "Sessie maken mislukt" }, 500);
  const { data: geldigTot, error: grantError } = await db.rpc("beheer_toestaan", { _session_id: sessionId, _user_id: userId });
  if (grantError || !geldigTot) return json({ ok: false, error: "Sessie maken mislukt" }, 500);
  return json({ ok: true, geldig_tot: geldigTot, access_token: sessie.session.access_token, refresh_token: sessie.session.refresh_token });
});
