import { FOTO_CATEGORIEEN, CATEGORIES, SECTIONS, getCategoriesBySection } from "./categories";

interface Station {
  naam_msr: string;
  behuizingsnummer: string | null;
  type_ruimte: string | null;
  datum: string | null;
  ingevuld_door: string | null;
}

interface Foto {
  id: string;
  categorie: string;
  url: string;
}

export interface PdfBranding {
  bedrijfsnaam?: string;
  regio?: string;
  logo_url?: string | null;
  primary_color?: string;
  primary_light_color?: string;
}

export function generatePdfHtml(station: Station, fotos: Foto[], branding?: PdfBranding): string {
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

  let pages = "";

  // ── COVER PAGE ──────────────────────────────────────────
  pages += `
  <div class="page cover-page">
    <div class="deco-arc deco-arc-1"></div>
    <div class="deco-arc deco-arc-2"></div>
    <div class="deco-arc deco-arc-3"></div>

    <div class="cover-logo">
      ${logoUrl 
        ? `<img src="${logoUrl}" alt="Logo" style="height:44px;max-width:180px;object-fit:contain;" />`
        : `<div class="logo-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M7 2L3 14h7l-2 8 11-12h-7l2-8z"/>
        </svg>
      </div>
      <span class="logo-text">${bedrijfsnaam}</span>`
      }
    </div>

    <div class="cover-center">
      <div class="cover-title-line1">Fotorapport</div>
      <div class="cover-title-line2">Technische Oplevering</div>
    </div>

    <div class="cover-info-block">
      <div class="cover-station-name">${station.naam_msr}</div>
      <div class="cover-meta-row">
        <span class="cover-chip ${isCS ? "chip-cs" : "chip-bs"}">${station.type_ruimte || "—"}</span>
        ${station.behuizingsnummer ? `<span class="cover-behuizing">${station.behuizingsnummer}</span>` : ""}
      </div>
      <div class="cover-details">
        <div class="cover-detail">
          <span class="detail-label">Datum</span>
          <span class="detail-value">${station.datum || "—"}</span>
        </div>
        <div class="cover-detail">
          <span class="detail-label">Ingevuld door</span>
          <span class="detail-value">${station.ingevuld_door || "—"}</span>
        </div>
        <div class="cover-detail">
          <span class="detail-label">Categorieën</span>
          <span class="detail-value detail-highlight">${filledCount} / ${totalCats}</span>
        </div>
        <div class="cover-detail">
          <span class="detail-label">Foto's</span>
          <span class="detail-value detail-highlight">${totalPhotos}</span>
        </div>
      </div>
      <div class="cover-progress">
        <div class="cover-progress-track">
          <div class="cover-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="cover-progress-pct">${pct}%</span>
      </div>
    </div>

    <div class="cover-footer-line">
      <span>${bedrijfsnaam}</span>
      <span class="cf-dot">·</span>
      <span>${regio}</span>
      <span class="cf-dot">·</span>
      <span>${new Date().toLocaleDateString("nl-NL")}</span>
    </div>
  </div>
  `;

  // ── TABLE OF CONTENTS PAGE ─────────────────────────────
  pages += `
  <div class="page toc-page">
    <div class="toc-banner">
      <h2 class="toc-title">Inhoudsopgave</h2>
    </div>

    <div class="toc-content">
      ${sectionGroups.map((group, sIdx) => `
        <div class="toc-section-header" style="background: linear-gradient(90deg, ${group.section.color}, ${group.section.color}dd);">
          <span class="toc-section-num">${String(sIdx + 1).padStart(2, "0")}</span>
          <span class="toc-section-name">${group.section.label}</span>
        </div>
        <div class="toc-items">
          ${group.categories.map((cat) => {
            const catFotos = categoriesWithFotos.find(cf => cf.id === cat.id);
            const count = catFotos?.fotos.length ?? 0;
            return `
              <div class="toc-item">
                <span class="toc-item-num">${String(cat.id).padStart(2, "0")}</span>
                <span class="toc-item-name">${cat.name}</span>
                <span class="toc-item-dots"></span>
                <span class="toc-item-count">${count} foto${count !== 1 ? "'s" : ""}</span>
              </div>
            `;
          }).join("")}
        </div>
      `).join("")}
    </div>

    <div class="toc-footer">
      <span class="toc-footer-left">
        <span class="footer-dot"></span>
        TO Fotorapport · ${bedrijfsnaam}
      </span>
      <span class="toc-footer-right">p. 2</span>
    </div>
  </div>
  `;

  // ── PHOTO PAGES (grouped by section with dividers) ─────
  let pageNum = 3;

  for (let sIdx = 0; sIdx < sectionGroups.length; sIdx++) {
    const group = sectionGroups[sIdx];

    // Section divider page
    pages += `
    <div class="page section-divider-page" style="background: ${group.section.color};">
      <div class="deco-arc deco-arc-1" style="border-color: rgba(255,255,255,0.15);"></div>
      <div class="deco-arc deco-arc-2" style="border-color: rgba(255,255,255,0.1);"></div>
      <div class="section-divider-content">
        <div class="section-divider-num">${String(sIdx + 1).padStart(2, "0")}</div>
        <h2 class="section-divider-title">${group.section.label}</h2>
        <p class="section-divider-desc">${group.section.description}</p>
        <div class="section-divider-stats">
          <span>${group.categories.length} categorieën</span>
          <span class="sd-dot">·</span>
          <span>${group.categories.reduce((sum, c) => sum + (categoriesWithFotos.find(cf => cf.id === c.id)?.fotos.length ?? 0), 0)} foto's</span>
        </div>
      </div>
      <div class="section-divider-footer">
        <span>TO Fotorapport · ${station.naam_msr}</span>
        <span class="pf-page">p. ${pageNum}</span>
      </div>
    </div>
    `;
    pageNum++;

    // Photo pages for each category in this section
    for (const cat of group.categories) {
      const catData = categoriesWithFotos.find(cf => cf.id === cat.id);
      if (!catData) continue;

      const chunks: Foto[][] = [];
      for (let i = 0; i < catData.fotos.length; i += 6) {
        chunks.push(catData.fotos.slice(i, i + 6));
      }

      for (const chunk of chunks) {
        const n = chunk.length;
        let gridClass = "grid-1";
        let gridStyle = "";
        if (n === 1) {
          gridClass = "grid-1";
          gridStyle = "grid-template-columns:1fr;grid-template-rows:1fr;";
        } else if (n === 2) {
          gridClass = "grid-2";
          gridStyle = "grid-template-columns:1fr 1fr;grid-template-rows:1fr;";
        } else if (n === 3) {
          gridClass = "grid-3";
          gridStyle = "grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr;";
        } else if (n === 4) {
          gridClass = "grid-4";
          gridStyle = "grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;";
        } else if (n === 5) {
          gridClass = "grid-5";
          gridStyle = "grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr 1fr;";
        } else {
          gridClass = "grid-6";
          gridStyle = "grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr 1fr;";
        }

        pages += `
        <div class="page photo-page">
          <div class="page-side-accent" style="background: linear-gradient(180deg, ${group.section.color} 0%, ${group.section.color}88 60%, ${group.section.color}33 100%);"></div>

          <div class="photo-header">
            <div class="ph-left">
              <span class="ph-cat-num" style="background: ${group.section.color};">${String(catData.id).padStart(2, "0")}</span>
              <span class="ph-cat-name">${catData.name}</span>
            </div>
            <div class="ph-right">
              <span class="ph-section-label" style="color: ${group.section.color};">${group.section.label}</span>
              <span class="ph-station">${station.naam_msr}</span>
            </div>
          </div>

          <div class="photo-grid ${gridClass}" style="${gridStyle}">
            ${chunk.map((foto, i) => `
              <div class="photo-cell">
                <img src="${foto.url}" alt="Foto ${i + 1}" loading="eager"/>
              </div>
            `).join("")}
          </div>

          <div class="photo-footer">
            <span class="pf-left">
              <span class="footer-dot" style="background: ${group.section.color};"></span>
              TO Fotorapport · ${bedrijfsnaam}
            </span>
            <span class="pf-center">${station.naam_msr}</span>
            <span class="pf-right">
              ${station.datum || ""}
              <span class="pf-page">p. ${pageNum}</span>
            </span>
          </div>
        </div>
        `;
        pageNum++;
      }
    }
  }

  // ── HTML OUTPUT ─────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<title>TO Fotorapport – ${station.naam_msr}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>

/* ── RESET ── */
@page { size: A4 portrait; margin: 0; }
@media print {
  .no-print { display: none !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
  .page { box-shadow: none !important; margin: 0 !important; }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: #e8eaed;
  color: #191c1e;
  -webkit-font-smoothing: antialiased;
}

/* ── PAGE SHELL ── */
.page {
  width: 210mm;
  height: 297mm;
  margin: 0 auto 16px;
  background: #ffffff;
  position: relative;
  overflow: hidden;
  page-break-after: always;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}
.page:last-child { page-break-after: avoid; }

/* ═══════════════════════════════════════
   COVER PAGE
═══════════════════════════════════════ */
.cover-page {
  background: ${coverBg};
  color: white;
}
.deco-arc {
  position: absolute;
  border-radius: 50%;
  border: 3px solid ${arcColor};
}
.deco-arc-1 {
  width: 600px; height: 600px;
  top: -120px; right: -200px;
  border-width: 4px;
  border-color: ${arcColor1};
}
.deco-arc-2 {
  width: 500px; height: 500px;
  top: -70px; right: -150px;
  border-width: 3px;
  border-color: ${arcColor2};
}
.deco-arc-3 {
  width: 450px; height: 450px;
  bottom: -100px; left: -150px;
  border-width: 4px;
  border-color: ${arcColor3};
}
.cover-logo {
  position: absolute;
  top: 40px; left: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 2;
}
.logo-icon {
  width: 44px; height: 44px;
  background: linear-gradient(135deg, #006e2d, #1cb050);
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(28,176,80,0.4);
}
.logo-text {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.5px;
  color: white;
}
.cover-center {
  position: absolute;
  left: 48px;
  top: 38%;
  z-index: 2;
}
.cover-title-line1 {
  font-size: 52px;
  font-weight: 900;
  line-height: 1.05;
  letter-spacing: -1.5px;
  color: white;
}
.cover-title-line2 {
  font-size: 28px;
  font-weight: 700;
  color: rgba(255,255,255,0.6);
  margin-top: 4px;
  letter-spacing: -0.3px;
}
.cover-info-block {
  position: absolute;
  bottom: 80px; left: 48px; right: 48px;
  z-index: 2;
}
.cover-station-name {
  font-size: 24px;
  font-weight: 800;
  color: white;
  margin-bottom: 8px;
  letter-spacing: -0.3px;
}
.cover-meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.cover-chip {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 12px;
  border-radius: 20px;
}
.chip-cs { background: rgba(232,84,26,0.2); color: #ff8c5a; }
.chip-bs { background: rgba(160,100,200,0.2); color: #c9a0e8; }
.cover-behuizing {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  font-family: 'Courier New', monospace;
}
.cover-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 20px;
  margin-bottom: 16px;
}
.cover-detail {
  display: flex;
  flex-direction: column;
}
.detail-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.35);
}
.detail-value {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255,255,255,0.85);
}
.detail-highlight {
  color: #1cb050;
}
.cover-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cover-progress-track {
  flex: 1;
  height: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  overflow: hidden;
}
.cover-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #006e2d, #1cb050);
  border-radius: 3px;
}
.cover-progress-pct {
  font-size: 13px;
  font-weight: 900;
  color: #1cb050;
}
.cover-footer-line {
  position: absolute;
  bottom: 28px;
  left: 0; right: 0;
  text-align: center;
  font-size: 9px;
  color: rgba(255,255,255,0.25);
  font-weight: 500;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  z-index: 2;
}
.cf-dot { color: rgba(255,255,255,0.15); }

/* ═══════════════════════════════════════
   TABLE OF CONTENTS
═══════════════════════════════════════ */
.toc-page { background: #ffffff; }
.toc-banner {
  background: #003318;
  padding: 32px 48px 28px;
  border-radius: 0 0 24px 0;
}
.toc-title {
  font-size: 36px;
  font-weight: 900;
  color: white;
  letter-spacing: -0.5px;
}
.toc-content {
  flex: 1;
  padding: 20px 48px;
  overflow: hidden;
}
.toc-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  color: white;
  padding: 6px 14px;
  border-radius: 8px;
  margin-bottom: 8px;
  margin-top: 12px;
}
.toc-section-header:first-child { margin-top: 0; }
.toc-section-num {
  font-size: 12px;
  font-weight: 900;
  background: rgba(255,255,255,0.2);
  padding: 2px 7px;
  border-radius: 5px;
}
.toc-section-name {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.toc-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 4px;
}
.toc-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 4px;
  border-bottom: 1px solid #f0f2f5;
}
.toc-item:last-child { border-bottom: none; }
.toc-item-num {
  font-size: 10px;
  font-weight: 800;
  color: #006e2d;
  font-family: 'Courier New', monospace;
  min-width: 20px;
}
.toc-item-name {
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  flex-shrink: 0;
}
.toc-item-dots {
  flex: 1;
  border-bottom: 1px dotted #d1d5db;
  margin: 0 4px;
  min-width: 20px;
  align-self: center;
  height: 0;
}
.toc-item-count {
  font-size: 10px;
  font-weight: 700;
  color: #9ca3af;
  flex-shrink: 0;
}
.toc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 9mm;
  padding: 0 14px;
  border-top: 1px solid #eaecef;
  flex-shrink: 0;
  background: #fafbfc;
}
.toc-footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 8px;
  font-weight: 600;
  color: #9ca3af;
}
.toc-footer-right {
  font-size: 9px;
  font-weight: 800;
  color: #006e2d;
}

/* ═══════════════════════════════════════
   SECTION DIVIDER PAGES
═══════════════════════════════════════ */
.section-divider-page {
  color: white;
  justify-content: center;
  align-items: flex-start;
}
.section-divider-content {
  padding: 0 56px;
  z-index: 2;
  position: relative;
}
.section-divider-num {
  font-size: 80px;
  font-weight: 900;
  color: rgba(255,255,255,0.15);
  line-height: 1;
  letter-spacing: -4px;
  margin-bottom: 12px;
}
.section-divider-title {
  font-size: 44px;
  font-weight: 900;
  letter-spacing: -1px;
  line-height: 1.1;
  margin-bottom: 16px;
}
.section-divider-desc {
  font-size: 16px;
  font-weight: 500;
  color: rgba(255,255,255,0.65);
  line-height: 1.6;
  max-width: 440px;
}
.section-divider-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 32px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255,255,255,0.5);
}
.sd-dot { color: rgba(255,255,255,0.25); }
.section-divider-footer {
  position: absolute;
  bottom: 28px;
  left: 56px;
  right: 56px;
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255,255,255,0.3);
  z-index: 2;
}

/* ═══════════════════════════════════════
   PHOTO PAGES
═══════════════════════════════════════ */
.photo-page { background: #ffffff; }
.page-side-accent {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 5px;
  z-index: 2;
}
.photo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 15mm;
  padding: 0 20px 0 20px;
  background: #f8faf9;
  border-bottom: 1.5px solid #e0ece4;
  flex-shrink: 0;
  margin-left: 5px;
}
.ph-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ph-cat-num {
  font-size: 10px;
  font-weight: 800;
  color: white;
  padding: 3px 8px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.5px;
}
.ph-cat-name {
  font-size: 13px;
  font-weight: 800;
  color: #191c1e;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.ph-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ph-section-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.ph-station {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}
.photo-grid {
  flex: 1;
  display: grid;
  gap: 8px;
  padding: 12px 16px 12px 21px;
  min-height: 0;
}
.photo-cell {
  border-radius: 8px;
  overflow: hidden;
  background: #f0f2f5;
  border: 1px solid #e5e7eb;
  position: relative;
  min-height: 0;
}
.photo-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.photo-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 9mm;
  padding: 0 20px 0 20px;
  border-top: 1px solid #eaecef;
  flex-shrink: 0;
  background: #fafbfc;
  margin-left: 5px;
}
.pf-left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 8px;
  font-weight: 600;
  color: #9ca3af;
}
.footer-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #1cb050;
  flex-shrink: 0;
}
.pf-center {
  font-size: 9px;
  font-weight: 700;
  color: #6b7280;
  text-align: center;
}
.pf-right {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 8px;
  font-weight: 500;
  color: #9ca3af;
}
.pf-page {
  font-weight: 800;
  color: #006e2d;
  font-size: 9px;
}

/* ── PRINT BUTTON ── */
.print-btn {
  position: fixed;
  top: 20px; right: 20px;
  z-index: 9999;
  background: linear-gradient(135deg, #006e2d, #1cb050);
  color: white;
  border: none;
  padding: 14px 28px;
  border-radius: 14px;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 8px 28px rgba(0,110,45,0.4);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s;
}
.print-btn:hover { transform: translateY(-1px); box-shadow: 0 12px 32px rgba(0,110,45,0.45); }
.print-btn:active { transform: scale(0.97); }

@media print {
  .photo-cell img {
    image-rendering: auto;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}

</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
  </svg>
  Opslaan als PDF
</button>

${pages}

<script>
window.addEventListener('load', async () => {
  const imgs = document.querySelectorAll('.photo-cell img');
  const MAX = 1200;
  for (const img of imgs) {
    try {
      if (img.naturalWidth <= MAX) continue;
      const canvas = document.createElement('canvas');
      const scale = MAX / img.naturalWidth;
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = canvas.toDataURL('image/jpeg', 0.82);
    } catch(e) { /* cross-origin fallback: skip */ }
  }
});
</script>

</body>
</html>`;
}
