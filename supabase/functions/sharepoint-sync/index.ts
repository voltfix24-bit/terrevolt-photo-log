import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { CATEGORIES, SECTIONS } from "./categories.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const Body = z.object({ station_id: z.string().uuid() });
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// SharePoint-veilige naam
const veilig = (s: unknown, max = 80) =>
  String(s ?? "").replace(/["*:<>?/\\|#%]/g, "").replace(/\s+/g, " ").trim().slice(0, max).trim() || "Onbekend";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function token() {
  const tenant = Deno.env.get("MS_TENANT_ID"), id = Deno.env.get("MS_CLIENT_ID"), secret = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenant || !id || !secret) throw new Error("SharePoint-gegevens ontbreken (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET)");
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  if (!r.ok) throw new Error(`Token mislukt [${r.status}]: ${await r.text()}`);
  return (await r.json()).access_token as string;
}

// Graph-aanroep met retry op 429/503 (Retry-After)
async function graph(tok: string, url: string, init: RequestInit = {}, okStatus: number[] = []): Promise<Response> {
  for (let poging = 0; poging < 6; poging++) {
    const r = await fetch(url.startsWith("http") ? url : GRAPH + url, {
      ...init,
      headers: { Authorization: `Bearer ${tok}`, ...(init.headers ?? {}) },
    });
    if (r.status === 429 || r.status === 503) {
      const wacht = Number(r.headers.get("Retry-After") ?? 2 ** poging);
      await r.body?.cancel();
      await sleep(Math.min(wacht, 30) * 1000);
      continue;
    }
    if (!r.ok && !okStatus.includes(r.status)) throw new Error(`Graph ${init.method ?? "GET"} ${url} [${r.status}]: ${await r.text()}`);
    return r;
  }
  throw new Error(`Graph bleef throttlen: ${url}`);
}

const enc = (pad: string) => pad.split("/").map(encodeURIComponent).join("/");

async function mapMaken(tok: string, root: string, pad: string[], cache: Set<string>) {
  for (let i = 0; i < pad.length; i++) {
    const huidig = pad.slice(0, i + 1).join("/");
    if (cache.has(huidig)) continue;
    const ouder = pad.slice(0, i).join("/");
    const url = ouder ? `${root}:/${enc(ouder)}:/children` : `${root}/children`;
    const r = await graph(tok, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: pad[i], folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    }, [409]);
    await r.body?.cancel();
    cache.add(huidig);
  }
}

async function upload(tok: string, root: string, pad: string, data: Uint8Array, type: string) {
  const basis = `${root}:/${enc(pad)}`;
  if (data.byteLength <= 4 * 1024 * 1024) {
    const r = await graph(tok, `${basis}:/content?@microsoft.graph.conflictBehavior=replace`, { method: "PUT", headers: { "Content-Type": type }, body: data });
    return await r.json();
  }
  const s = await graph(tok, `${basis}:/createUploadSession`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
  });
  const { uploadUrl } = await s.json();
  const blok = 320 * 1024 * 10; // 3,2 MB, veelvoud van 320 KiB
  let laatste: any = null;
  for (let start = 0; start < data.byteLength; start += blok) {
    const eind = Math.min(start + blok, data.byteLength);
    for (let poging = 0; ; poging++) {
      const r = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Length": String(eind - start), "Content-Range": `bytes ${start}-${eind - 1}/${data.byteLength}` },
        body: data.slice(start, eind),
      });
      if ((r.status === 429 || r.status === 503) && poging < 5) { await sleep(Number(r.headers.get("Retry-After") ?? 2) * 1000); continue; }
      if (!r.ok) throw new Error(`Upload sessie [${r.status}]: ${await r.text()}`);
      laatste = await r.json();
      break;
    }
  }
  return laatste;
}

async function parallel<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!req.headers.get("Authorization")?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const stationId = parsed.data.station_id;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const status = (v: Record<string, unknown>) =>
    db.from("sharepoint_sync").upsert({ station_id: stationId, gesynct_op: new Date().toISOString(), ...v });

  const { data: station } = await db.from("stations").select("*").eq("id", stationId).maybeSingle();
  if (!station) return json({ error: "Station niet gevonden" }, 404);
  await status({ status: "bezig", fout: null });

  try {
    const siteUrl = Deno.env.get("SHAREPOINT_SITE_URL");
    if (!siteUrl) throw new Error("SHAREPOINT_SITE_URL ontbreekt");
    const u = new URL(siteUrl);
    const tok = await token();
    // Ondersteunt een site-URL (…/sites/Naam) of een deellink naar een map (…/:f:/…)
    let root: string;
    let prefix: string[];
    if (/^\/:[a-z]:\//i.test(u.pathname)) {
      const b64 = btoa(siteUrl).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
      const item = await (await graph(tok, `/shares/u!${b64}/driveItem`)).json();
      root = `/drives/${item.parentReference.driveId}/items/${item.id}`;
      prefix = [];
    } else {
      // Pak alleen /sites/Naam of /teams/Naam uit het adres; anders de hoofdsite van de tenant
      const m = decodeURIComponent(u.pathname).match(/^\/(sites|teams)\/[^/]+/i);
      const site = await (await graph(tok, m ? `/sites/${u.hostname}:${encodeURI(m[0])}` : `/sites/${u.hostname}`)).json();
      const drive = await (await graph(tok, `/sites/${site.id}/drive`)).json();
      root = `/drives/${drive.id}/root`;
      prefix = ["Opleveringen"];
    }

    const [{ data: fotos }, { data: opm }, { data: skips }] = await Promise.all([
      db.from("fotos").select("categorie, storage_path, uploaded_at").eq("station_id", stationId).order("uploaded_at"),
      db.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", stationId),
      db.from("categorie_skips").select("categorie, reden").eq("station_id", stationId),
    ]);

    const jaar = String(new Date(station.datum ?? station.submitted_at ?? Date.now()).getFullYear());
    const caseMap = station.casenummer || station.casenaam
      ? veilig([station.casenummer, station.casenaam].filter(Boolean).join(" - "))
      : "Zonder case";
    const stationMap = veilig([station.behuizingsnummer, station.naam_msr].filter(Boolean).join(" - "));
    const basis = [...prefix, veilig(station.opdrachtgever ?? "Onbekende opdrachtgever"), jaar, caseMap, stationMap];
    const sectieMap = (sid: string) => {
      const i = SECTIONS.findIndex((s) => s.id === sid);
      return i < 0 ? "99 Overig" : `${String(i + 1).padStart(2, "0")} ${veilig(SECTIONS[i].label)}`;
    };

    const cache = new Set<string>();
    await mapMaken(tok, root, [...basis, "00 Rapport"], cache);
    for (const s of SECTIONS) await mapMaken(tok, root, [...basis, sectieMap(s.id)], cache);

    // Foto's per categorie, zelfde naamgeving als zip-download
    const perCat = new Map<string, string[]>();
    for (const f of fotos ?? []) perCat.set(f.categorie, [...(perCat.get(f.categorie) ?? []), f.storage_path]);
    const taken: { pad: string; storage: string }[] = [];
    for (const [cat, paden] of perCat) {
      const c = CATEGORIES.find((x) => x.name === cat);
      const nr = c ? String(c.id).padStart(2, "0") : "00";
      const map = c ? sectieMap(c.section) : "99 Overig";
      if (!c) await mapMaken(tok, root, [...basis, map], cache);
      paden.forEach((p, i) => taken.push({ pad: [...basis, map, `${veilig(`${nr}_${cat}_${i + 1}`)}.jpg`].join("/"), storage: p }));
    }

    let aantal = 0;
    await parallel(taken, 4, async (t) => {
      const { data, error } = await db.storage.from("to-fotos").download(t.storage);
      if (error || !data) throw new Error(`Foto niet gevonden in opslag: ${t.storage}`);
      await upload(tok, root, t.pad, new Uint8Array(await data.arrayBuffer()), "image/jpeg");
      aantal++;
    });

    const { data: rapport } = await db.storage.from("rapporten").download(`${stationId}/rapport.html`);
    if (rapport) {
      await upload(tok, root, [...basis, "00 Rapport", "rapport.html"].join("/"), new Uint8Array(await rapport.arrayBuffer()), "text/html");
      aantal++;
    }

    const regels: string[] = [`${station.naam_msr}`, `Opmerkingen per categorie`, ""];
    for (const o of opm ?? []) if (o.opmerking?.trim()) regels.push(`- ${o.categorie}: ${o.opmerking.trim()}`);
    if (!(opm ?? []).some((o) => o.opmerking?.trim())) regels.push("(geen)");
    regels.push("", "Niet van toepassing", "");
    for (const s of skips ?? []) regels.push(`- ${s.categorie}: ${s.reden ?? ""}`);
    if (!(skips ?? []).length) regels.push("(geen)");
    await upload(tok, root, [...basis, "opmerkingen.txt"].join("/"), new TextEncoder().encode(regels.join("\r\n")), "text/plain; charset=utf-8");
    aantal++;

    const map = await (await graph(tok, `${root}:/${enc(basis.join("/"))}`)).json();
    await status({ status: "gelukt", aantal_bestanden: aantal, sharepoint_url: map.webUrl ?? null, fout: null });
    return json({ ok: true, aantal_bestanden: aantal, sharepoint_url: map.webUrl });
  } catch (e) {
    const fout = (e as Error).message;
    console.error("sharepoint-sync mislukt:", fout);
    await status({ status: "mislukt", fout: fout.slice(0, 1000) });
    return json({ error: fout }, 500);
  }
});
