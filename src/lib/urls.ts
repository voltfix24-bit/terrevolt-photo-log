// Leesbare, hiërarchische app-urls die de SharePoint-mappen volgen:
// /{opdrachtgever}/{jaar}/{casenummer-casenaam}[/sectie[/categorie] | /opleveren | /rapport | /documenten]
// Stations zonder casenummer: /stations/{behuizingsnummer}-{naam}
import { CATEGORIES, SECTIONS, slugify } from "@/lib/categories";

export const PUBLISHED_ORIGIN = "https://to-foto.lovable.app";

/** Van Gelder-cases hebben geen fotowerk/rapport/oplevering: alleen Cases & TO. */
export const isVanGelder = (s: { uitvoerder?: string | null } | null | undefined) => s?.uitvoerder === "van_gelder";

export type UrlStation = {
  id: string;
  uitvoerder?: "terrevolt" | "van_gelder" | null;
  casenummer?: string | null;
  casenaam?: string | null;
  opdrachtgever?: string | null;
  behuizingsnummer?: string | null;
  naam_msr?: string | null;
  datum?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

const tr = (v?: string | null) => String(v ?? "").trim();
export const slug = (v?: string | null) => slugify(tr(v)).replace(/_/g, "-");

export const opdrachtgeverNaam = (s: UrlStation) => tr(s.opdrachtgever) || "van Gelder";
export const opdrachtgeverSlug = (s: UrlStation) => slug(opdrachtgeverNaam(s));
// Zelfde volgorde als de SharePoint-sync: datum, anders submitted_at, anders created_at
export const jaarVan = (s: UrlStation) => String(new Date(s.datum || s.submitted_at || s.created_at || Date.now()).getFullYear());
export const heeftCase = (s: UrlStation) => tr(s.casenummer) !== "";
export const caseNrSlug = (s: UrlStation) => slug(s.casenummer);
export const caseSlug = (s: UrlStation) => [caseNrSlug(s), slug(s.casenaam)].filter(Boolean).join("-");
export const stationSlug = (s: UrlStation) => [tr(s.behuizingsnummer).replace(/\s+/g, ""), slug(s.naam_msr)].filter(Boolean).join("-").toLowerCase();

export const sectieSlug = (sectionId: string) => slug(SECTIONS.find((s) => s.id === sectionId)?.label ?? sectionId);
export const categorieSlug = (cat: { id: number; name: string }) => `${cat.id}-${slug(cat.name)}`;

export const opdrachtgeverUrl = (s: UrlStation) => `/${opdrachtgeverSlug(s)}`;
export const jaarUrl = (s: UrlStation) => `/${opdrachtgeverSlug(s)}/${jaarVan(s)}`;
export function caseUrl(s: UrlStation) {
  return heeftCase(s) ? `/${opdrachtgeverSlug(s)}/${jaarVan(s)}/${caseSlug(s)}` : `/stations/${stationSlug(s) || s.id}`;
}
export const sectieUrl = (s: UrlStation, sectionId: string) => `${caseUrl(s)}/${sectieSlug(sectionId)}`;
export function categorieUrl(s: UrlStation, cat: { id: number; name?: string }) {
  const c = CATEGORIES.find((x) => x.id === cat.id);
  if (!c) return caseUrl(s);
  return `${sectieUrl(s, c.section)}/${categorieSlug(c)}`;
}
export const opleverUrl = (s: UrlStation) => `${caseUrl(s)}/opleveren`;
export const rapportUrl = (s: UrlStation) => `${caseUrl(s)}/rapport`;
export const documentenUrl = (s: UrlStation) => `${caseUrl(s)}/documenten`;
export const beoordeelUrl = (s: UrlStation) => `/beoordelen/${heeftCase(s) ? caseSlug(s) : stationSlug(s) || s.id}`;
export const casesUrl = (s: UrlStation) => `/cases/${heeftCase(s) ? caseSlug(s) : stationSlug(s) || s.id}`;
/** Volledige, deelbare link met het domein van de gepubliceerde app. */
export const korteUrl = (s: UrlStation) => (heeftCase(s) ? `${PUBLISHED_ORIGIN}/c/${caseNrSlug(s)}` : `${PUBLISHED_ORIGIN}${caseUrl(s)}`);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Station bij een case-slug: zoekt op casenummer (langste prefix-match), negeert de casenaam. */
export function zoekOpCaseSlug<S extends UrlStation>(stations: S[], key: string): S[] {
  const k = slug(key);
  let best: S[] = [], len = 0;
  for (const s of stations) {
    const nr = caseNrSlug(s);
    if (!nr || !(k === nr || k.startsWith(nr + "-"))) continue;
    if (nr.length > len) { best = [s]; len = nr.length; } else if (nr.length === len) best.push(s);
  }
  return best;
}
/** Station bij een /stations/-sleutel: uuid, of behuizingsnummer-naam (behuizingsnummer bepaalt). */
export function zoekOpStationSlug<S extends UrlStation>(stations: S[], key: string): S | undefined {
  if (UUID_RE.test(key)) return stations.find((s) => s.id === key);
  const k = key.toLowerCase();
  return stations.find((s) => stationSlug(s) === k)
    ?? stations.find((s) => { const b = tr(s.behuizingsnummer).replace(/\s+/g, "").toLowerCase(); return b && (k === b || k.startsWith(b + "-")); });
}

export type Sub =
  | { soort: "case" }
  | { soort: "sectie"; sectionId: string }
  | { soort: "categorie"; sectionId: string; categorieId: number }
  | { soort: "opleveren" | "rapport" | "documenten" };

/** Leest de subpaden na de case; onbekend → case-niveau. */
export function leesSub(rest: string[]): Sub {
  const [a, b] = rest.filter(Boolean).map((x) => x.toLowerCase());
  if (!a) return { soort: "case" };
  if (a === "opleveren" || a === "rapport" || a === "documenten") return { soort: a };
  const sec = SECTIONS.find((s) => sectieSlug(s.id) === a);
  if (b) {
    const id = parseInt(b, 10);
    const c = CATEGORIES.find((x) => x.id === id);
    if (c) return { soort: "categorie", sectionId: c.section, categorieId: c.id };
  }
  return sec ? { soort: "sectie", sectionId: sec.id } : { soort: "case" };
}

export function subUrl(s: UrlStation, sub: Sub) {
  switch (sub.soort) {
    case "case": return caseUrl(s);
    case "sectie": return sectieUrl(s, sub.sectionId);
    case "categorie": return categorieUrl(s, { id: sub.categorieId });
    default: return `${caseUrl(s)}/${sub.soort}`;
  }
}
