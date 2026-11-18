// Gedeelde SharePoint-logica voor sharepoint-sync en sharepoint-weekly
import { CATEGORIES, SECTIONS } from "./sharepoint-categories.ts";

export const GRAPH = "https://graph.microsoft.com/v1.0";

// SharePoint-veilige naam
export const veilig = (s: unknown, max = 80) =>
  String(s ?? "").replace(/["*:<>?/\\|#%]/g, "").replace(/\s+/g, " ").trim().slice(0, max).trim() || "Onbekend";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function token() {
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
export async function graph(tok: string, url: string, init: RequestInit = {}, okStatus: number[] = []): Promise<Response> {
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

export const enc = (pad: string) => pad.split("/").map(encodeURIComponent).join("/");

export async function mapMaken(tok: string, root: string, pad: string[], cache: Set<string>) {
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

export async function upload(tok: string, root: string, pad: string, data: Uint8Array, type: string) {
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

export async function parallel<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

export async function bepaalRoot() {
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

    return { tok, root, prefix };
}


export type Ctx = { tok: string; root: string; prefix: string[]; driveId: string };
export async function context(): Promise<Ctx> {
  const { tok, root, prefix } = await bepaalRoot();
  return { tok, root, prefix, driveId: root.split("/")[2] };
}

export type Resultaat = {
  toegevoegd: string[]; verwijderd: string[]; verplaatst: string[]; leegVerwijderd: string[];
  aantal_bestanden: number; sharepoint_url: string | null; item_id: string | null;
};

const sectieMap = (sid: string) => {
  const i = SECTIONS.findIndex((s) => s.id === sid);
  return i < 0 ? "99 Overig" : `${String(i + 1).padStart(2, "0")} ${veilig(SECTIONS[i].label)}`;
};
// Mappen die de app beheert: alleen hierin worden bestanden verwijderd
export const BEHEERDE_MAPPEN = ["00 Rapport", ...SECTIONS.map((s) => sectieMap(s.id)), "99 Overig"];

const tr = (v: unknown) => String(v ?? "").trim();

/** Alleen opgeleverde stations met casenummer én casenaam gaan naar SharePoint. Geeft de reden terug als het niet mag. */
export function nietSyncReden(station: any): string | null {
  if (!tr(station.casenummer) || !tr(station.casenaam)) return "case ontbreekt";
  if (!["opgeleverd", "goedgekeurd"].includes(station.status)) return "nog niet opgeleverd";
  return null;
}

const caseSleutel = (s: any) => `${tr(s.casenummer).toLowerCase()}|${tr(s.casenaam).toLowerCase()}`;
const stationNaam = (s: any) => veilig([tr(s.behuizingsnummer), tr(s.naam_msr)].filter(Boolean).join(" - "));

/** Doelmap: de casemap; alleen als een case meerdere stations heeft een submap per station. */
export function stationPad(prefix: string[], station: any, meerdere = false) {
  const jaar = String(new Date(station.datum ?? station.submitted_at ?? Date.now()).getFullYear());
  const caseMap = veilig(`${tr(station.casenummer)} - ${tr(station.casenaam)}`);
  const pad = [...prefix, veilig(tr(station.opdrachtgever) || "van Gelder"), jaar, caseMap];
  return meerdere ? [...pad, stationNaam(station)] : pad;
}

async function caseHeeftMeerdere(db: any, station: any) {
  const { data } = await db.from("stations").select("id, casenummer, casenaam, status").in("status", ["opgeleverd", "goedgekeurd"]);
  return (data ?? []).filter((s: any) => !nietSyncReden(s) && caseSleutel(s) === caseSleutel(station)).length > 1;
}

// Pad van een drive-item relatief aan de drive-root, bv. "Opleveringen/van Gelder/2026/..."
const itemPad = (it: any) => {
  const p = decodeURIComponent(String(it.parentReference?.path ?? "").replace(/^.*?root:\/?/, ""));
  return [p, it.name].filter(Boolean).join("/");
};

async function getItem(ctx: Ctx, url: string) {
  const r = await graph(ctx.tok, url, {}, [404]);
  if (r.status === 404) { await r.body?.cancel(); return null; }
  return await r.json();
}
const opPad = (ctx: Ctx, pad: string[]) => getItem(ctx, `${ctx.root}:/${enc(pad.join("/"))}`);
const opId = (ctx: Ctx, id: string) => getItem(ctx, `/drives/${ctx.driveId}/items/${id}`);

async function kinderen(ctx: Ctx, url: string): Promise<any[]> {
  const uit: any[] = [];
  let next: string | null = `${url}/children?$top=999&$select=id,name,size,file,folder`;
  while (next) {
    const r = await graph(ctx.tok, next, {}, [404]);
    if (r.status === 404) { await r.body?.cancel(); return uit; }
    const j = await r.json();
    uit.push(...(j.value ?? []));
    next = j["@odata.nextLink"] ?? null;
  }
  return uit;
}

async function verwijderAlsLeeg(ctx: Ctx, id: string, naam: string, dryRun: boolean, res: Resultaat, nogBezet = 0) {
  const k = await kinderen(ctx, `/drives/${ctx.driveId}/items/${id}`);
  if (k.length > nogBezet) return;
  res.leegVerwijderd.push(naam);
  if (!dryRun) await (await graph(ctx.tok, `/drives/${ctx.driveId}/items/${id}`, { method: "DELETE" }, [404])).body?.cancel();
}

async function verplaats(ctx: Ctx, id: string, ouderPad: string[], naam: string) {
  const cache = new Set<string>();
  await mapMaken(ctx.tok, ctx.root, ouderPad, cache);
  const ouder = await opPad(ctx, ouderPad);
  const r = await graph(ctx.tok, `/drives/${ctx.driveId}/items/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { id: ouder.id }, name: naam }),
  });
  return await r.json();
}

/** Synchroniseer één station: hernoemen/verplaatsen, uploaden wat ontbreekt of anders is, en verwijderen wat niet meer in de app staat. */
export async function syncStation(ctx: Ctx, db: any, station: any, vorigItemId: string | null, dryRun = false): Promise<Resultaat> {
  const res: Resultaat = { toegevoegd: [], verwijderd: [], verplaatst: [], leegVerwijderd: [], aantal_bestanden: 0, sharepoint_url: null, item_id: vorigItemId };
  const reden = nietSyncReden(station);
  if (reden) throw new Error(`Niet naar SharePoint: ${reden}`);
  const basis = stationPad(ctx.prefix, station, await caseHeeftMeerdere(db, station));
  const doel = basis.join("/");

  // 1. Hernoemen/verplaatsen van de bestaande stationmap
  if (vorigItemId) {
    const it = await opId(ctx, vorigItemId);
    if (!it) res.item_id = null;
    else if (itemPad(it) === `${doel}/${stationNaam(station)}` && it.folder) {
      // Oude structuur {case}/{station}/: inhoud één niveau omhoog en lege stationmap weg
      res.verplaatst.push(`${itemPad(it)} → ${doel}`);
      if (!dryRun) {
        for (const k of await kinderen(ctx, `/drives/${ctx.driveId}/items/${it.id}`)) {
          await (await graph(ctx.tok, `/drives/${ctx.driveId}/items/${k.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parentReference: { id: it.parentReference.id } }),
          })).body?.cancel();
        }
        await verwijderAlsLeeg(ctx, it.id, itemPad(it), false, res);
      }
    } else if (itemPad(it) !== doel) {
      const bestaat = await opPad(ctx, basis);
      if (bestaat && bestaat.id !== it.id) throw new Error(`Kan map niet verplaatsen: "${doel}" bestaat al`);
      res.verplaatst.push(`${itemPad(it)} → ${doel}`);
      if (!dryRun) {
        await verplaats(ctx, it.id, basis.slice(0, -1), basis[basis.length - 1]);
        if (it.parentReference?.id) await verwijderAlsLeeg(ctx, it.parentReference.id, itemPad(it).split("/").slice(0, -1).join("/"), false, res);
      } else if (it.parentReference?.id) {
        await verwijderAlsLeeg(ctx, it.parentReference.id, itemPad(it).split("/").slice(0, -1).join("/"), true, res, 1);
      }
    }
  }

  const [{ data: fotos }, { data: opm }, { data: skips }] = await Promise.all([
    db.from("fotos").select("categorie, storage_path, uploaded_at").eq("station_id", station.id).order("uploaded_at"),
    db.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", station.id),
    db.from("categorie_skips").select("categorie, reden").eq("station_id", station.id),
  ]);

  // Gewenste bestanden per beheerde map
  const taken: { map: string; naam: string; storage: string }[] = [];
  const perCat = new Map<string, string[]>();
  for (const f of fotos ?? []) perCat.set(f.categorie, [...(perCat.get(f.categorie) ?? []), f.storage_path]);
  for (const [cat, paden] of perCat) {
    const c = CATEGORIES.find((x) => x.name === cat);
    const nr = c ? String(c.id).padStart(2, "0") : "00";
    const map = c ? sectieMap(c.section) : "99 Overig";
    paden.forEach((p, i) => taken.push({ map, naam: `${veilig(`${nr}_${cat}_${i + 1}`)}.jpg`, storage: p }));
  }
  const { data: rapport } = await db.storage.from("rapporten").download(`${station.id}/rapport.html`);

  const regels: string[] = [`${station.naam_msr}`, `Opmerkingen per categorie`, ""];
  for (const o of opm ?? []) if (o.opmerking?.trim()) regels.push(`- ${o.categorie}: ${o.opmerking.trim()}`);
  if (!(opm ?? []).some((o: any) => o.opmerking?.trim())) regels.push("(geen)");
  regels.push("", "Niet van toepassing", "");
  for (const s of skips ?? []) regels.push(`- ${s.categorie}: ${s.reden ?? ""}`);
  if (!(skips ?? []).length) regels.push("(geen)");
  const opmTekst = new TextEncoder().encode(regels.join("\r\n"));

  // 2. Huidige inhoud van de beheerde mappen
  const nuInMap = new Map<string, any[]>();
  for (const m of BEHEERDE_MAPPEN) nuInMap.set(m, await kinderen(ctx, `${ctx.root}:/${enc([...basis, m].join("/"))}:`));
  const gewenst = new Map<string, Set<string>>(BEHEERDE_MAPPEN.map((m) => [m, new Set<string>()]));
  for (const t of taken) gewenst.get(t.map)!.add(t.naam.toLowerCase());
  if (rapport) gewenst.get("00 Rapport")!.add("rapport.html");

  if (!dryRun) {
    const cache = new Set<string>();
    await mapMaken(ctx.tok, ctx.root, [...basis, "00 Rapport"], cache);
    for (const s of SECTIONS) await mapMaken(ctx.tok, ctx.root, [...basis, sectieMap(s.id)], cache);
    if (taken.some((t) => t.map === "99 Overig")) await mapMaken(ctx.tok, ctx.root, [...basis, "99 Overig"], cache);
  }

  // 3. Uploaden wat ontbreekt of een andere grootte heeft
  const grootte = (map: string, naam: string) => nuInMap.get(map)?.find((x) => x.file && x.name.toLowerCase() === naam.toLowerCase())?.size;
  await parallel(taken, 4, async (t) => {
    let data: Blob | null = null, error: any = null;
    for (let p = 0; p < 4 && !data; p++) {
      ({ data, error } = await db.storage.from("to-fotos").download(t.storage));
      if (!data) await sleep(1000 * (p + 1));
    }
    if (error || !data) throw new Error(`Foto niet opgehaald uit opslag (${error?.message ?? "onbekend"}): ${t.storage}`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    res.aantal_bestanden++;
    if (grootte(t.map, t.naam) === bytes.byteLength) return;
    res.toegevoegd.push(`${t.map}/${t.naam}`);
    if (!dryRun) await upload(ctx.tok, ctx.root, [...basis, t.map, t.naam].join("/"), bytes, "image/jpeg");
  });
  if (rapport) {
    const b = new Uint8Array(await rapport.arrayBuffer());
    res.aantal_bestanden++;
    if (grootte("00 Rapport", "rapport.html") !== b.byteLength) {
      res.toegevoegd.push("00 Rapport/rapport.html");
      if (!dryRun) await upload(ctx.tok, ctx.root, [...basis, "00 Rapport", "rapport.html"].join("/"), b, "text/html");
    }
  }
  res.aantal_bestanden++;
  const opmNu = (await kinderen(ctx, `${ctx.root}:/${enc(doel)}:`)).find((x) => x.file && x.name === "opmerkingen.txt");
  if (opmNu?.size !== opmTekst.byteLength) {
    res.toegevoegd.push("opmerkingen.txt");
    if (!dryRun) await upload(ctx.tok, ctx.root, [...basis, "opmerkingen.txt"].join("/"), opmTekst, "text/plain; charset=utf-8");
  }

  // 4. Verwijderen: alleen bestanden in beheerde mappen die niet meer bij de app horen
  for (const [map, items] of nuInMap) {
    for (const it of items) {
      if (!it.file || gewenst.get(map)!.has(it.name.toLowerCase())) continue;
      res.verwijderd.push(`${map}/${it.name}`);
      if (!dryRun) await (await graph(ctx.tok, `/drives/${ctx.driveId}/items/${it.id}`, { method: "DELETE" }, [404])).body?.cancel();
    }
  }

  const map = await opPad(ctx, basis);
  res.sharepoint_url = map?.webUrl ?? null;
  res.item_id = map?.id ?? res.item_id;
  return res;
}

/** Station bestaat niet meer: map naar Opleveringen/_Verwijderd verplaatsen (niet hard verwijderen). */
export async function verplaatsVerwijderd(ctx: Ctx, itemId: string, stationId: string, dryRun = false): Promise<Resultaat> {
  const res: Resultaat = { toegevoegd: [], verwijderd: [], verplaatst: [], leegVerwijderd: [], aantal_bestanden: 0, sharepoint_url: null, item_id: itemId };
  const it = await opId(ctx, itemId);
  if (!it) return res;
  const doelOuder = [...ctx.prefix, "_Verwijderd"];
  let naam = it.name as string;
  if (await opPad(ctx, [...doelOuder, naam])) naam = veilig(`${naam} (${stationId.slice(0, 8)})`);
  res.verplaatst.push(`${itemPad(it)} → ${[...doelOuder, naam].join("/")}`);
  if (dryRun) return res;
  const nieuw = await verplaats(ctx, it.id, doelOuder, naam);
  res.sharepoint_url = nieuw.webUrl ?? null;
  if (it.parentReference?.id) await verwijderAlsLeeg(ctx, it.parentReference.id, itemPad(it).split("/").slice(0, -1).join("/"), false, res);
  return res;
}
