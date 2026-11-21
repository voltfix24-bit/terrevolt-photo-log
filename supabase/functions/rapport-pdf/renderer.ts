import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { isBeheerder } from "../_shared/admin-auth.ts";
// Professioneel PDF-opleverrapport. Stap 1 (per aanroep één foto): te grote of gedraaide foto's opnieuw comprimeren naar een cache.
// Stap 2: PDF opbouwen met pdf-lib (miniatuur + paginavullende foto delen dezelfde afbeelding), opslaan, daarna SharePoint-sync.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { PDFDocument, PDFFont, PDFImage, PDFPage, PDFString, StandardFonts, rgb, RGB } from "npm:pdf-lib@1.17.1";
import jpeg from "npm:jpeg-js@0.4.4";
import { CATEGORIES, SECTIONS } from "../_shared/sharepoint-categories.ts";
import { Claim, Bezet, revisiePad, immutableUpload, exacteFotos, hashBytes, toetsDossier } from "../_shared/verwerking.ts";
import { ketenKick } from "../_shared/keten-kick.ts";

export const Body = z.object({ station_id: z.string().uuid(), stap: z.number().int().min(0).optional(), run: z.string().uuid().optional(), keten: z.boolean().optional() });
export const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
export const db = () => createClient((Deno.env.get("SUPABASE_URL") ?? ""), (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""));
const BUCKET = "rapporten";
const MAX_ORIGINEEL = 500_000; // groter → opnieuw comprimeren (kwaliteit omlaag, resolutie gelijk)
const KWALITEIT = 78;
const MAX_ZIJDE = 2400;

const SECTIE_KLEUR: Record<string, string> = {
  algemeen: "150 100% 20%", "ms-deel": "220 80% 40%", "kabels-ms": "280 60% 40%", trafo: "30 90% 40%",
  "ls-deel": "190 70% 35%", meting: "340 70% 40%", "ovl-deel": "60 80% 30%", gebouw: "150 60% 30%",
};
function hsl(s: string | null | undefined, fallback = "150 100% 20%"): RGB {
  const m = (s || fallback).match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/) ?? ["", "150", "100", "20"];
  const h = +m[1] / 360, sa = +m[2] / 100, l = +m[3] / 100;
  const q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return rgb(f(h + 1 / 3), f(h), f(h - 1 / 3));
}
const mix = (c: RGB, w: number) => rgb(c.red + (1 - c.red) * w, c.green + (1 - c.green) * w, c.blue + (1 - c.blue) * w);

// ---------- JPEG-hulpjes ----------
function orientatie(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let p = 2;
  while (p + 10 < b.length && b[p] === 0xff) {
    const m = b[p + 1], len = (b[p + 2] << 8) | b[p + 3];
    if (m === 0xda) return 1;
    if (m === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
      const t = p + 10, le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) => (le ? b[o] + b[o + 1] * 256 + b[o + 2] * 65536 + b[o + 3] * 16777216 : b[o] * 16777216 + b[o + 1] * 65536 + b[o + 2] * 256 + b[o + 3]);
      const ifd = t + u32(t + 4);
      if (ifd + 2 > b.length) return 1;
      const n = u16(ifd);
      for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (e + 10 > b.length) break; if (u16(e) === 0x0112) return u16(e + 8); }
      return 1;
    }
    p += 2 + len;
  }
  return 1;
}
function hercomprimeer(b: Uint8Array, ori: number): Uint8Array {
  const raw = jpeg.decode(b, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 400 });
  let w = raw.width, h = raw.height;
  let px = new Uint32Array(raw.data.buffer, raw.data.byteOffset, w * h);
  if (ori === 3 || ori === 6 || ori === 8) {
    const uit = new Uint32Array(w * h);
    const nw = ori === 3 ? w : h, nh = ori === 3 ? h : w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = px[y * w + x];
      if (ori === 3) uit[(h - 1 - y) * w + (w - 1 - x)] = v;
      else if (ori === 6) uit[x * nw + (h - 1 - y)] = v;
      else uit[(w - 1 - x) * nw + y] = v;
    }
    px = uit; w = nw; h = nh;
  }
  const lang = Math.max(w, h);
  if (lang > MAX_ZIJDE) {
    const s = MAX_ZIJDE / lang, nw = Math.round(w * s), nh = Math.round(h * s), uit = new Uint32Array(nw * nh);
    for (let y = 0; y < nh; y++) { const sy = Math.min(h - 1, Math.floor(y / s)); for (let x = 0; x < nw; x++) uit[y * nw + x] = px[sy * w + Math.min(w - 1, Math.floor(x / s))]; }
    px = uit; w = nw; h = nh;
  }
  return jpeg.encode({ data: new Uint8Array(px.buffer), width: w, height: h }, KWALITEIT).data;
}

// ---------- Tekst (standaardfonts kennen alleen WinAnsi) ----------
const WIN = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const tx = (s: unknown) => [...String(s ?? "").replace(/[\r\t]/g, " ").replace(/←/g, "‹").replace(/→/g, "›")]
  .map((c) => { const k = c.charCodeAt(0); return c === "\n" || (k >= 32 && k < 127) || (k >= 160 && k < 256) || WIN.has(c) ? c : "?"; }).join("");
function wrap(s: string, f: PDFFont, size: number, w: number): string[] {
  const uit: string[] = [];
  for (const alinea of tx(s).split("\n")) {
    let regel = "";
    for (const woord of alinea.split(/\s+/)) {
      const probeer = regel ? `${regel} ${woord}` : woord;
      if (f.widthOfTextAtSize(probeer, size) <= w || !regel) regel = probeer; else { uit.push(regel); regel = woord; }
    }
    uit.push(regel);
  }
  return uit;
}
const fmtDT = (d: string | null | undefined, tijd = true) => d ? new Date(d).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric", ...(tijd ? { hour: "2-digit", minute: "2-digit" } : {}) }) : "—";

async function volgende(stationId: string, run: string, stap: number, keten: boolean) {
  // De runtime begrenst hoe snel een functie zichzelf aanroept: wacht dan de opgegeven tijd en probeer opnieuw
  for (let p = 0; p < 6; p++) {
    try { return await volgendeEens(stationId, run, stap, keten); }
    catch (e) {
      const ms = Number((e as Error).message.match(/Retry after (\d+)ms/)?.[1] ?? 0);
      if (!ms || p === 5) throw e;
      await new Promise((r) => setTimeout(r, ms + 500));
    }
  }
}
async function volgendeEens(stationId: string, run: string, stap: number, keten: boolean) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/rapport-pdf`, {
    method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ station_id: stationId, run, stap, keten }),
  });
  await r.body?.cancel();
  if (!r.ok) throw new Error(`PDF vervolg geweigerd (${r.status})`);
}
async function sharepoint(stationId: string) {
  for (let p = 0; p < 6; p++) {
    try {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sharepoint-sync`, {
        method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_CRON_SECRET")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ station_id: stationId }),
      });
      if (!r.ok) console.error(`sharepoint-sync [${r.status}]: ${await r.text()}`); else await r.body?.cancel();
      return;
    } catch (e) {
      const ms = Number((e as Error).message.match(/Retry after (\d+)ms/)?.[1] ?? 0);
      if (!ms || p === 5) { console.error("sharepoint-sync niet bereikbaar:", (e as Error).message); return; }
      await new Promise((r) => setTimeout(r, ms + 500));
    }
  }
}
const catInfo = (naam: string) => CATEGORIES.find((c) => c.name === naam);
async function download(sb: any, bucket: string, pad: string): Promise<Uint8Array | null> {
  for (let p = 0; p < 3; p++) {
    const { data } = await sb.storage.from(bucket).download(pad);
    if (data) return new Uint8Array(await data.arrayBuffer());
    if (p < 2) await new Promise((r) => setTimeout(r, 800 * (p + 1)));
  }
  return null;
}
const cachePad = (sid: string, run: string, fid: string) => revisiePad(sid, run, `pdf-cache/${fid}.jpg`);

// ---------- Stap 1: één foto voorbereiden ----------
export async function voorbereiden(sid: string, run: string, stap: number, keten = true) {
  const sb = db();
  let claim: Claim;
  try { claim = await Claim.neem(sb, sid, run); }
  catch (e) { if (!(e instanceof Bezet)) console.error("PDF claim:", (e as Error).message); return; }
  let next: number | null = null;
  try {
    const dossier = await claim.snapshot();
    toetsDossier(dossier);
    const fotos = dossier.fotos;
    const { data: st } = await sb.from("opleverruns").select("pdf_pad").eq("id", run).single();
    if (st?.pdf_pad) return;
    if (stap < fotos.length) {
      const f = fotos[stap];
      const cached = await download(sb, BUCKET, cachePad(sid, run, f.id));
      if (!cached) {
        const b = await download(sb, "to-fotos", f.storage_path);
        if (!b?.byteLength) throw new Error(`Foto ontbreekt: ${f.id} (${f.categorie})`);
        const ori = orientatie(b);
        let uit = b;
        if (b[0] === 0xff && (b.byteLength > MAX_ORIGINEEL || ori !== 1)) uit = hercomprimeer(b, ori);
        await immutableUpload(sb, cachePad(sid, run, f.id), uit, "image/jpeg", claim);
      }
      next = stap + 1;
    } else {
      await bouwPdf(sb, sid, fotos, run, dossier, claim);
    }
  } catch (e) {
    console.error("rapport-pdf mislukt:", (e as Error).message);
    await claim.save(undefined, { status: "mislukt", fout: (e as Error).message.slice(0,1000), klaar_op: new Date().toISOString() }).catch(() => {});
  } finally { await claim.release().catch(() => {}); }
  // No recursive endpoint request while holding the station claim.
  if (next !== null) await volgende(sid, run, next, keten);
  else await ketenKick(sid);
}

// ---------- Stap 2: PDF opbouwen ----------
export async function bouwPdf(sb: any, sid: string, fotos: any[], run: string, dossier: any, claim: Claim) {
  const { station, opmerkingen: opm, skips, instellingen: inst, acties } = dossier;
  const groen = hsl(inst?.primary_color), goud = hsl(inst?.accent_gold_color, "44 100% 23%");
  const inkt = rgb(0.09, 0.13, 0.11), sub = rgb(0.4, 0.45, 0.42), lijn = rgb(0.88, 0.9, 0.88), zacht = rgb(0.96, 0.97, 0.96);
  const bedrijf = "Terrevolt B.V.";
  const casenr = String(station.casenummer ?? "").trim(), casenaam = String(station.casenaam ?? "").trim();
  const kopTekst = tx(`${station.naam_msr ?? ""}${casenr ? ` · ${casenr}` : ""}`);

  const doc = await PDFDocument.create();
  doc.setTitle(tx(`Opleverrapport ${casenr} - ${casenaam || station.naam_msr}`), { showInWindowTitleBar: true });
  doc.setAuthor(bedrijf); doc.setSubject(casenr || tx(station.naam_msr)); doc.setCreator("TO Foto's"); doc.setProducer(bedrijf);
  doc.setLanguage("nl-NL"); doc.setCreationDate(new Date()); doc.setModificationDate(new Date());
  const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48, TOP = H - 70, BOT = 62, CW = W - 2 * M;
  const links: { van: PDFPage; rect: number[]; naar: () => PDFPage }[] = [];
  const pagina = () => doc.addPage([W, H]);

  // Afbeeldingen: elke foto één keer insluiten
  const img = new Map<string, PDFImage>();
  for (const f of fotos) {
    const b = (await download(sb, BUCKET, cachePad(sid, run, f.id))) ?? (await download(sb, "to-fotos", f.storage_path));
    await claim.check();
    if (!b?.byteLength) throw new Error(`Foto ontbreekt: ${f.id} (${f.categorie})`);
    try { img.set(f.id, await doc.embedJpg(b)); } catch { try { img.set(f.id, await doc.embedPng(b)); } catch { throw new Error(`Foto onleesbaar: ${f.id} (${f.categorie})`); } }
  }
  exacteFotos(fotos, img.keys());
  const opmPer = new Map<string,string>((opm ?? []).filter((o: any) => o.opmerking?.trim()).map((o: any) => [o.categorie, o.opmerking.trim()]));
  const skipPer = new Map<string,string>((skips ?? []).map((s: any) => [s.categorie, s.reden ?? ""]));
  const perCat = new Map<string, any[]>();
  for (const f of fotos) if (img.has(f.id)) perCat.set(f.categorie, [...(perCat.get(f.categorie) ?? []), f]);

  // ---- Voorblad ----
  const voor = pagina();
  voor.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: groen });
  let logo: PDFImage | null = null;
  if (inst?.logo_url) {
    try { const r = await fetch(inst.logo_url); const b = new Uint8Array(await r.arrayBuffer()); logo = b[0] === 0x89 ? await doc.embedPng(b) : await doc.embedJpg(b); } catch { logo = null; }
  }
  if (logo) { const s = Math.min(170 / logo.width, 60 / logo.height); voor.drawImage(logo, { x: M, y: H - 70 - logo.height * s, width: logo.width * s, height: logo.height * s }); }
  voor.drawText("Opleverrapport", { x: M, y: H - 230, size: 38, font: B, color: inkt });
  voor.drawRectangle({ x: M, y: H - 250, width: 56, height: 3, color: goud });
  let vy = H - 290;
  for (const r of wrap(station.naam_msr ?? "", B, 22, CW)) { voor.drawText(r, { x: M, y: vy, size: 22, font: B, color: groen }); vy -= 28; }
  if (casenr || casenaam) { for (const r of wrap(`Case ${casenr}${casenaam ? ` - ${casenaam}` : ""}`, R, 15, CW)) { voor.drawText(r, { x: M, y: vy, size: 15, font: R, color: sub }); vy -= 20; } }
  vy -= 30;
  const statusTxt = station.status === "goedgekeurd" ? "Goedgekeurd" : station.status === "opgeleverd" ? "Opgeleverd" : station.status === "afgekeurd" ? "Afgekeurd" : String(station.status ?? "—");
  const velden: [string, string][] = [
    ["Stationsnaam", station.naam_msr], ["Behuizingsnummer", station.behuizingsnummer], ["Casenummer", casenr], ["Casenaam", casenaam],
    ["Opdrachtgever", station.opdrachtgever || "van Gelder"], ["Type ruimte", station.type_ruimte], ["Opleverdatum", fmtDT(station.submitted_at ?? station.datum, false)],
    ["Monteur", station.ingevuld_door || station.submitted_by], ["Status", statusTxt],
  ];
  for (const [k, v] of velden) {
    voor.drawLine({ start: { x: M, y: vy + 15 }, end: { x: W - M, y: vy + 15 }, thickness: 0.6, color: lijn });
    voor.drawText(k, { x: M, y: vy, size: 11, font: R, color: sub });
    voor.drawText(tx(v || "—").slice(0, 70), { x: M + 150, y: vy, size: 11, font: k === "Status" ? B : R, color: k === "Status" ? groen : inkt });
    vy -= 26;
  }
  // Korte app-link naar de case (zelfde opbouw als src/lib/urls.ts korteUrl)
  if (casenr) {
    const kort = `https://to-foto.lovable.app/c/${encodeURIComponent(casenr.replace(/\s+/g, ""))}`;
    vy -= 10;
    voor.drawText("Bekijk online:", { x: M, y: vy, size: 11, font: R, color: sub });
    voor.drawText(kort, { x: M + 150, y: vy, size: 11, font: R, color: groen });
    const bw = R.widthOfTextAtSize(kort, 11);
    const ua = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [M + 150, vy - 3, M + 150 + bw, vy + 11], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(kort) } }));
    voor.node.addAnnot(ua);
  }

  // ---- Samenvatting ----
  const sam = pagina();
  let y = TOP;
  const kop = (p: PDFPage, t: string, kleur: RGB = groen) => { p.drawText(tx(t), { x: M, y, size: 20, font: B, color: kleur }); p.drawRectangle({ x: M, y: y - 10, width: 40, height: 2.5, color: goud }); y -= 40; };
  kop(sam, "Samenvatting");
  sam.drawText(tx(`${fotos.length} foto's · ${perCat.size} categorieën gefotografeerd · ${skipPer.size} niet van toepassing`), { x: M, y, size: 11, font: R, color: sub });
  y -= 28;
  for (const s of SECTIONS) {
    const cats = CATEGORIES.filter((c) => c.section === s.id && !skipPer.has(c.name));
    const klaar = cats.filter((c) => perCat.has(c.name)).length;
    const kl = hsl(SECTIE_KLEUR[s.id]);
    sam.drawRectangle({ x: M, y: y - 3, width: 4, height: 14, color: kl });
    sam.drawText(tx(s.label), { x: M + 12, y, size: 11, font: R, color: inkt });
    const bx = M + 250, bw = 160;
    sam.drawRectangle({ x: bx, y: y - 1, width: bw, height: 8, color: zacht });
    if (cats.length) sam.drawRectangle({ x: bx, y: y - 1, width: bw * (klaar / cats.length), height: 8, color: kl });
    sam.drawText(`${klaar} van ${cats.length}`, { x: bx + bw + 14, y, size: 11, font: B, color: inkt });
    y -= 22;
  }
  const lijst = (titel: string, regels: [string, string][]) => {
    y -= 16;
    sam.drawText(tx(titel), { x: M, y, size: 13, font: B, color: inkt }); y -= 20;
    if (!regels.length) { sam.drawText("Geen", { x: M, y, size: 10.5, font: R, color: sub }); y -= 16; return; }
    for (const [a, b] of regels) {
      if (y < BOT + 30) return;
      sam.drawText(tx(a).slice(0, 60), { x: M, y, size: 10.5, font: B, color: inkt });
      for (const r of wrap(b || "—", R, 10.5, CW - 200)) { sam.drawText(r, { x: M + 200, y, size: 10.5, font: R, color: sub }); y -= 14; }
      y -= 4;
    }
  };
  lijst("Niet van toepassing", [...skipPer.entries()]);
  lijst("Open TO-actiepunten", (acties ?? []).map((a: any) => [a.bij === "Derden" ? a.derde_naam || "Derden" : a.bij, a.omschrijving]));

  // ---- Inhoudsopgave (wordt ingevuld zodra paginanummers bekend zijn) ----
  const ioPagina = pagina();

  // ---- Secties ----
  const sectieStart = new Map<string, PDFPage>();
  const fotoBron: { f: any; van: PDFPage; rect: number[]; sectie: string; sectiePagina: PDFPage; nr: number; tot: number }[] = [];
  const gap = 10, tw = (CW - 2 * gap) / 3, th = tw * 0.75;
  for (const s of SECTIONS) {
    const cats = CATEGORIES.filter((c) => c.section === s.id);
    const kl = hsl(SECTIE_KLEUR[s.id]);
    let p = pagina(); y = TOP;
    sectieStart.set(s.id, p);
    const sectieKop = (vervolg: boolean) => {
      p.drawRectangle({ x: M, y: y - 8, width: CW, height: 32, color: mix(kl, 0.88) });
      p.drawRectangle({ x: M, y: y - 8, width: 5, height: 32, color: kl });
      p.drawText(tx(`${s.label}${vervolg ? " (vervolg)" : ""}`), { x: M + 16, y: y + 2, size: 15, font: B, color: kl });
      y -= 44;
    };
    const nieuw = () => { p = pagina(); y = TOP; sectieKop(true); };
    sectieKop(false);
    for (const c of cats) {
      const fs = perCat.get(c.name) ?? [];
      const opmTxt = opmPer.get(c.name);
      if (y - 40 < BOT) nieuw();
      p.drawText(String(c.id).padStart(2, "0"), { x: M, y, size: 11, font: B, color: kl });
      p.drawText(tx(c.name), { x: M + 24, y, size: 11.5, font: B, color: inkt });
      const status = skipPer.has(c.name) ? "Niet van toepassing" : fs.length ? `${fs.length} foto${fs.length === 1 ? "" : "'s"}` : "Geen foto";
      p.drawText(status, { x: W - M - R.widthOfTextAtSize(status, 9.5), y, size: 9.5, font: R, color: sub });
      y -= 16;
      if (skipPer.has(c.name) && !fs.length) {
        // N.v.t.-blok in de sectie zelf, met reden
        const rg = wrap(`Reden: ${skipPer.get(c.name) || "Geen reden opgegeven"}`, R, 10, CW - 24);
        const hb = rg.length * 13 + 28;
        if (y - hb < BOT) nieuw();
        p.drawRectangle({ x: M, y: y - hb + 8, width: CW, height: hb, color: rgb(0.93, 0.94, 0.93) });
        p.drawRectangle({ x: M, y: y - hb + 8, width: 3, height: hb, color: sub });
        p.drawText("NIET GEMAAKT / N.V.T.", { x: M + 12, y: y - 6, size: 9, font: B, color: sub });
        let ny = y - 20;
        for (const r of rg) { p.drawText(r, { x: M + 12, y: ny, size: 10, font: R, color: inkt }); ny -= 13; }
        y -= hb + 4;
      }
      for (let i = 0; i < fs.length; i += 3) {
        if (y - th < BOT) nieuw();
        fs.slice(i, i + 3).forEach((f, j) => {
          const im = img.get(f.id); if (!im) throw new Error(`Foto ontbreekt: ${f.id}`);
          const x = M + j * (tw + gap), yb = y - th;
          p.drawRectangle({ x, y: yb, width: tw, height: th, color: zacht });
          const sc = Math.min(tw / im.width, th / im.height), iw = im.width * sc, ih = im.height * sc;
          p.drawImage(im, { x: x + (tw - iw) / 2, y: yb + (th - ih) / 2, width: iw, height: ih });
          fotoBron.push({ f, van: p, rect: [x, yb, x + tw, y], sectie: s.label, sectiePagina: (sectieStart.get(s.id) ?? p), nr: i + j + 1, tot: fs.length });
        });
        y -= th + gap;
      }
      if (opmTxt) {
        const rg = wrap(opmTxt, R, 10, CW - 24);
        const hb = rg.length * 13 + 26;
        if (y - hb < BOT) nieuw();
        p.drawRectangle({ x: M, y: y - hb + 8, width: CW, height: hb, color: mix(goud, 0.9) });
        p.drawRectangle({ x: M, y: y - hb + 8, width: 3, height: hb, color: goud });
        p.drawText("NOTITIE", { x: M + 12, y: y - 6, size: 9, font: B, color: goud });
        let oy = y - 20;
        for (const r of rg) { p.drawText(r, { x: M + 12, y: oy, size: 10, font: R, color: inkt }); oy -= 13; }
        y -= hb + 4;
      }
      y -= 12;
    }
  }

  // ---- Bijlage: elke foto paginavullend ----
  const bijlage = pagina(); y = TOP;
  kop(bijlage, "Bijlage: foto's");
  bijlage.drawText("Klik in het rapport op een miniatuur om hier de foto groot te bekijken.", { x: M, y, size: 11, font: R, color: sub });
  for (const b of fotoBron) {
    const p = pagina(), im = img.get(b.f.id), c = catInfo(b.f.categorie);
    if (!im) throw new Error(`Foto ontbreekt: ${b.f.id}`);
    let py = TOP;
    const terug = tx(`‹ Terug naar ${b.sectie}`);
    p.drawText(terug, { x: M, y: py, size: 11, font: B, color: groen });
    links.push({ van: p, rect: [M - 4, py - 5, M + B.widthOfTextAtSize(terug, 11) + 4, py + 13], naar: () => b.sectiePagina });
    py -= 26;
    p.drawText(tx(`${c ? String(c.id).padStart(2, "0") + "  " : ""}${b.f.categorie}`), { x: M, y: py, size: 14, font: B, color: inkt });
    py -= 18;
    const gps = b.f.gps_afstand_m != null ? ` · GPS ${Math.round(Number(b.f.gps_afstand_m))} m van station` : "";
    p.drawText(tx(`Foto ${b.nr} van ${b.tot} · ${fmtDT(b.f.uploaded_at ?? b.f.created_at)}${gps}`), { x: M, y: py, size: 10, font: R, color: sub });
    py -= 14;
    const ah = py - BOT, sc = Math.min(CW / im.width, ah / im.height), iw = im.width * sc, ih = im.height * sc;
    p.drawImage(im, { x: M + (CW - iw) / 2, y: py - ih, width: iw, height: ih });
    links.push({ van: b.van, rect: b.rect, naar: () => p });
  }

  // ---- Inhoudsopgave invullen ----
  const pages = doc.getPages();
  const nr = (p: PDFPage) => pages.indexOf(p) + 1;
  y = TOP; kop(ioPagina, "Inhoud");
  const ioRegel = (t: string, p: PDFPage, kleur: RGB) => {
    ioPagina.drawRectangle({ x: M, y: y - 3, width: 4, height: 14, color: kleur });
    ioPagina.drawText(tx(t), { x: M + 14, y, size: 12, font: R, color: inkt });
    const n = String(nr(p));
    ioPagina.drawText(n, { x: W - M - R.widthOfTextAtSize(n, 12), y, size: 12, font: B, color: inkt });
    links.push({ van: ioPagina, rect: [M, y - 6, W - M, y + 16], naar: () => p });
    y -= 26;
  };
  ioRegel("Samenvatting", sam, goud);
  for (const s of SECTIONS) ioRegel(s.label, (sectieStart.get(s.id) ?? sam), hsl(SECTIE_KLEUR[s.id]));
  ioRegel("Bijlage: foto's", bijlage, goud);

  // ---- Links ----
  for (const l of links) {
    const a = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: l.rect, Border: [0, 0, 0], Dest: [l.naar().ref, "Fit"] }));
    l.van.node.addAnnot(a);
  }
  // ---- Kop- en voettekst ----
  pages.forEach((p, i) => {
    p.drawText(kopTekst.slice(0, 80), { x: M, y: H - 34, size: 8.5, font: R, color: sub });
    p.drawText(bedrijf, { x: W - M - R.widthOfTextAtSize(bedrijf, 8.5), y: H - 34, size: 8.5, font: R, color: sub });
    p.drawLine({ start: { x: M, y: H - 42 }, end: { x: W - M, y: H - 42 }, thickness: 0.5, color: lijn });
    p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: lijn });
    p.drawText(bedrijf, { x: M, y: 26, size: 8.5, font: R, color: sub });
    const t = `${i + 1} / ${pages.length}`;
    p.drawText(t, { x: W - M - R.widthOfTextAtSize(t, 8.5), y: 26, size: 8.5, font: R, color: sub });
  });

  exacteFotos(fotos, fotoBron.map(b => b.f.id));
  const pad = revisiePad(sid, run, "rapport.pdf");
  // A completed immutable upload from an interrupted worker is reusable.
  const existing = await download(sb, BUCKET, pad);
  const bytes = existing ?? await doc.save();
  await immutableUpload(sb, pad, bytes, "application/pdf", claim);
  const hash = await hashBytes(bytes);
  await claim.save({ pdf_pad: pad, pdf_hash: hash }, { status: "klaar", fout: null, bytes: bytes.byteLength, paginas: pages.length, fotos: fotoBron.length, klaar_op: new Date().toISOString(), geaccepteerde_run: run, pdf_pad: pad, pdf_hash: hash });
  return { ids: fotoBron.map(b => b.f.id), bytes, paginas: pages.length };
}

