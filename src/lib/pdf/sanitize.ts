// ---- Veilige uitvoer: alle vrije tekst wordt ge-escaped, urls en kleuren gevalideerd ----
import type { Foto, Opmerking, PdfBranding, Skip, Station } from "./types";

export function escHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c] as string));
}
/** Alleen http(s)- en data:image-urls; al het andere wordt leeg. Resultaat is attribuut-veilig. */
export function veiligeUrl(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^https?:\/\//i.test(s) || /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(s)) return escHtml(s);
  return "";
}
/** HSL-token zoals "150 100% 20%"; anders de standaardwaarde. */
export function veiligHsl(v: unknown, standaard: string): string {
  const s = String(v ?? "").trim();
  return /^\d{1,3}(\.\d+)?[ ,]+\d{1,3}(\.\d+)?%[ ,]+\d{1,3}(\.\d+)?%$/.test(s) ? s : standaard;
}
const escOpt = (v: string | null) => (v == null ? null : escHtml(v));

/** Maakt alle invoer HTML-veilig voordat de bouwstenen hem gebruiken. */
export function saneerInvoer(station: Station, fotos: Foto[], branding?: PdfBranding, opmerkingen?: Opmerking[], skips?: Skip[]) {
  const s: Station = {
    naam_msr: escHtml(station.naam_msr), behuizingsnummer: escOpt(station.behuizingsnummer),
    type_ruimte: escOpt(station.type_ruimte), datum: escOpt(station.datum), ingevuld_door: escOpt(station.ingevuld_door),
  };
  // categorie blijft ruw (wordt gematcht met vaste namen), alleen de url wordt uitgevoerd
  const f = fotos.map((x) => ({ ...x, url: veiligeUrl(x.url) })).filter((x) => x.url);
  const b: PdfBranding | undefined = branding && {
    bedrijfsnaam: branding.bedrijfsnaam ? escHtml(branding.bedrijfsnaam) : undefined,
    regio: branding.regio ? escHtml(branding.regio) : undefined,
    logo_url: branding.logo_url ? veiligeUrl(branding.logo_url) || null : null,
    primary_color: veiligHsl(branding.primary_color, "150 100% 20%"),
    primary_light_color: veiligHsl(branding.primary_light_color, "140 65% 66%"),
  };
  const o = opmerkingen?.map((x) => ({ categorie: x.categorie, opmerking: escHtml(x.opmerking) }));
  const k = skips?.map((x) => ({ categorie: escHtml(x.categorie), reden: escHtml(x.reden) }));
  return { s, f, b, o, k };
}
