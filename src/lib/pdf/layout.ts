import { FOTO_CATEGORIEEN, CATEGORIES, getCategoriesBySection } from "../categories";
import type { Foto, PdfBranding, Station } from "./types";

/** Afgeleide kleuren, telling en sectiegroepering voor het rapport (invoer is al gesaneerd). */
export function pdfContext(station: Station, fotos: Foto[], branding?: PdfBranding) {
  const bedrijfsnaam = branding?.bedrijfsnaam || 'Terrevolt B.V.';
  const regio = branding?.regio || 'Liander Zuidoost';
  const logoUrl = branding?.logo_url;
  
  // Derive CSS colors from branding HSL values
  const primaryHsl = branding?.primary_color || '150 100% 20%';
  const primaryLightHsl = branding?.primary_light_color || '140 65% 66%';
  const primaryCss = `hsl(${primaryHsl})`;
  const primaryLightCss = `hsl(${primaryLightHsl})`;
  // Parse primary HSL for dark/cover background variant
  const hslParts = primaryHsl.split(/[\s,]+/);
  const primaryHue = hslParts[0] || '150';
  const coverBg = `hsl(${primaryHue} 100% 10%)`;
  const arcColor = `hsla(${primaryHue}, 80%, 40%, 0.25)`;
  const arcColor1 = `hsla(${primaryHue}, 80%, 40%, 0.3)`;
  const arcColor2 = `hsla(${primaryHue}, 80%, 40%, 0.2)`;
  const arcColor3 = `hsla(${primaryHue}, 80%, 40%, 0.18)`;
  const categoriesWithFotos = FOTO_CATEGORIEEN
    .map((cat) => ({
      name: cat,
      id: CATEGORIES.find((c) => c.name === cat)?.id ?? 0,
      section: CATEGORIES.find((c) => c.name === cat)?.section ?? "",
      fotos: fotos.filter((f) => f.categorie === cat),
    }))
    .filter((c) => c.fotos.length > 0);

  const totalPhotos = fotos.length;
  const filledCount = categoriesWithFotos.length;
  const totalCats = CATEGORIES.length;
  const pct = Math.round((filledCount / totalCats) * 100);
  const isCS = station.type_ruimte === "Compact Station";

  // Group filled categories by section
  const sectionGroups = getCategoriesBySection().map(({ section, categories }) => ({
    section,
    categories: categories.filter(c => categoriesWithFotos.some(cf => cf.id === c.id)),
  })).filter(g => g.categories.length > 0);
  return { bedrijfsnaam, regio, logoUrl, primaryHsl, primaryLightHsl, primaryCss, primaryLightCss, primaryHue, coverBg, arcColor, arcColor1, arcColor2, arcColor3, categoriesWithFotos, totalPhotos, filledCount, totalCats, pct, isCS, sectionGroups };
}
export type PdfContext = ReturnType<typeof pdfContext>;
