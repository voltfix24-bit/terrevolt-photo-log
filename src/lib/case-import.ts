import { normaliseer, nrSleutel } from "@/lib/case-service";
import type { ToStatus } from "@/lib/to-rondes";

export type ImportVeld = "casenummer" | "casenaam" | "status" | "ronde" | "wv" | "ingediend_op" | "notitie" | "on_hold" | "on_hold_reden";
export const VELD_LABEL: Record<ImportVeld, string> = {
  casenummer: "Casenummer", casenaam: "Casenaam", status: "TO-status", ronde: "Ronde", wv: "WV", ingediend_op: "Ingediend op", notitie: "Notitie", on_hold: "On hold", on_hold_reden: "Reden on hold",
};
export const VELDEN = Object.keys(VELD_LABEL) as ImportVeld[];
export type Mapping = (ImportVeld | null)[];

const SYNONIEMEN: Record<ImportVeld, string[]> = {
  casenummer: ["casenummer", "nr", "case", "casenr", "nummer"],
  casenaam: ["naam", "casenaam", "adres"],
  status: ["status", "tostatus"],
  ronde: ["ronde"],
  wv: ["wv", "werkverantwoordelijke"],
  ingediend_op: ["datum", "ingediend", "ingediendop"],
  notitie: ["notitie", "opmerking", "opmerkingen"],
  on_hold: ["onhold"],
  on_hold_reden: ["reden", "onholdreden", "redenonhold"],
};
export const kopSleutel = (k: string) => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function herkenKop(k: string): ImportVeld | null {
  const s = kopSleutel(k);
  return (VELDEN.find((v) => SYNONIEMEN[v].includes(s)) ?? null);
}

/** TSV zoals Excel het op het klembord zet: tabs, CRLF, BOM, velden tussen aanhalingstekens (met "" en regeleinden). */
export function parseTsv(tekst: string): string[][] {
  const t = tekst.replace(/^\uFEFF/, "");
  const rijen: string[][] = [];
  let rij: string[] = [], veld = "", i = 0, quoted = false;
  while (i < t.length) {
    const c = t[i];
    if (quoted) {
      if (c === '"') { if (t[i + 1] === '"') { veld += '"'; i += 2; continue; } quoted = false; i++; continue; }
      veld += c; i++; continue;
    }
    if (c === '"' && veld === "") { quoted = true; i++; continue; }
    if (c === "\t") { rij.push(veld); veld = ""; i++; continue; }
    if (c === "\r" || c === "\n") { rij.push(veld); rijen.push(rij); rij = []; veld = ""; i += c === "\r" && t[i + 1] === "\n" ? 2 : 1; continue; }
    veld += c; i++;
  }
  if (veld !== "" || rij.length) { rij.push(veld); rijen.push(rij); }
  return rijen.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
}

/** Herkent koppen; een tweede kolom voor hetzelfde veld blijft ongekoppeld (conflict). */
export function startMapping(koppen: string[]): Mapping {
  const gezien = new Set<ImportVeld>();
  return koppen.map((k) => { const v = herkenKop(k); if (!v || gezien.has(v)) return null; gezien.add(v); return v; });
}
export const isDubbelHerkend = (koppen: string[], m: Mapping, i: number) => m[i] === null && herkenKop(koppen[i]) !== null;
/** Kolom i koppelen; een andere kolom met hetzelfde veld wordt losgekoppeld zodat er nooit twee bronnen zijn. */
export function zetMapping(m: Mapping, i: number, v: ImportVeld | null): Mapping {
  return m.map((x, j) => (j === i ? v : v && x === v ? null : x));
}

export function mapStatus(v: string): ToStatus | null {
  const s = normaliseer(v).toLowerCase();
  if (!s || s === "open" || s === "to open") return "open";
  if (s === "ter controle" || s === "ingediend" || s === "controle") return "controle";
  if (s === "afgekeurd") return "afgekeurd";
  if (s === "goedgekeurd") return "goedgekeurd";
  return null;
}

const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
/** YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY; Excel-serienummer alleen uit .xlsx. Ongeldige kalenderdatum → null. */
export function parseDatum(v: string, excelSerial = false): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  if (excelSerial && /^\d+(\.\d+)?$/.test(s)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}

export type RijKlasse = "nieuw" | "waarschuwing" | "bestaat" | "fout";
export type ImportPreviewRij = {
  regel: number; klasse: RijKlasse; redenen: string[];
  casenummer: string; casenaam: string; status: ToStatus; ronde: number; wv: string; ingediend_op: string | null; notitie: string;
  on_hold: boolean; on_hold_reden: string;
};

export function bouwPreview(grid: string[][], m: Mapping, bestaand: Iterable<string>, opts: { excelSerial?: boolean } = {}): ImportPreviewRij[] {
  const kol = (v: ImportVeld) => m.indexOf(v);
  const lees = (r: string[], v: ImportVeld) => (kol(v) >= 0 ? normaliseer(r[kol(v)] ?? "") : "");
  const al = new Set([...bestaand].map(nrSleutel));
  const gezien = new Set<string>();
  return grid.slice(1).map((r, idx) => {
    const redenen: string[] = [];
    let klasse: RijKlasse = "nieuw";
    const casenummer = lees(r, "casenummer"), casenaam = lees(r, "casenaam");
    const ruweStatus = lees(r, "status"), ruweRonde = lees(r, "ronde"), ruweDatum = lees(r, "ingediend_op");
    let status = mapStatus(ruweStatus);
    if (!status) { status = "open"; klasse = "waarschuwing"; redenen.push(`Onbekende status "${ruweStatus}" → TO open`); }
    let ronde = 1;
    if (ruweRonde) {
      if (/^\d+$/.test(ruweRonde) && +ruweRonde >= 1 && +ruweRonde <= 50) ronde = +ruweRonde;
      else { klasse = "fout"; redenen.unshift(`Ongeldige ronde "${ruweRonde}"`); }
    }
    let ingediend_op: string | null = null;
    if (ruweDatum) {
      ingediend_op = parseDatum(ruweDatum, opts.excelSerial);
      if (!ingediend_op) { klasse = "fout"; redenen.unshift(`Ongeldige datum "${ruweDatum}"`); }
      else if (status === "open") { ingediend_op = null; if (klasse !== "fout") klasse = "waarschuwing"; redenen.push("Datum genegeerd bij TO open"); }
    }
    const ruweHold = lees(r, "on_hold").toLowerCase();
    const on_hold = ["ja", "j", "yes", "y", "true", "1", "x", "on hold"].includes(ruweHold);
    if (ruweHold && !on_hold && !["nee", "n", "no", "false", "0", "-"].includes(ruweHold) && klasse !== "fout") { klasse = "waarschuwing"; redenen.push(`On hold "${ruweHold}" niet herkend → nee`); }
    if (!casenummer) { klasse = "fout"; redenen.unshift("Geen nr."); }
    if (!casenaam) { klasse = "fout"; redenen.unshift("Geen naam"); }
    if (casenummer.length > 100 || casenaam.length > 300) { klasse = "fout"; redenen.unshift("Te lang"); }
    const k = nrSleutel(casenummer);
    if (klasse !== "fout" && casenummer) {
      if (al.has(k)) { klasse = "bestaat"; redenen.unshift("Bestaat al"); }
      else if (gezien.has(k)) { klasse = "bestaat"; redenen.unshift("Dubbel in plaksel"); }
    }
    if (casenummer) gezien.add(k);
    return { regel: idx + 2, klasse, redenen, casenummer, casenaam, status, ronde, wv: lees(r, "wv"), ingediend_op, notitie: kol("notitie") >= 0 ? (r[kol("notitie")] ?? "").trim() : "", on_hold, on_hold_reden: on_hold ? lees(r, "on_hold_reden") : "" };
  });
}
export const importeerbaar = (rijen: ImportPreviewRij[]) => rijen.filter((r) => r.klasse === "nieuw" || r.klasse === "waarschuwing");
export const ontbrekendeVerplicht = (m: Mapping) => (["casenummer", "casenaam"] as ImportVeld[]).filter((v) => !m.includes(v));

/** .xlsx-cellen naar tekst; datums als ISO zodat dezelfde preview geldt. */
export const celTekst = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v).trim());
