import { FOTO_CATEGORIEEN, CATEGORIES } from "./categories";

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

export function generatePdfHtml(station: Station, fotos: Foto[]): string {
  const categoriesWithFotos = FOTO_CATEGORIEEN
    .map((cat) => ({
      name: cat,
      id: CATEGORIES.find((c) => c.name === cat)?.id ?? 0,
      fotos: fotos.filter((f) => f.categorie === cat),
    }))
    .filter((c) => c.fotos.length > 0);

  const totalPhotos = fotos.length;
  const filledCount = categoriesWithFotos.length;
  const pct = Math.round((filledCount / 40) * 100);
  const isCS = station.type_ruimte === "Compact Station";

  let pages = "";

  // ── COVER PAGE ──────────────────────────────────────────
  pages += `
  <div class="page cover-page">
    <!-- Decorative arcs (inspired by reference) -->
    <div class="deco-arc deco-arc-1"></div>
    <div class="deco-arc deco-arc-2"></div>
    <div class="deco-arc deco-arc-3"></div>

    <!-- Logo top-left -->
    <div class="cover-logo">
      <div class="logo-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M7 2L3 14h7l-2 8 11-12h-7l2-8z"/>
        </svg>
      </div>
      <span class="logo-text">TerreVolt</span>
    </div>

    <!-- Center title block -->
    <div class="cover-center">
      <div class="cover-title-line1">Fotorapport</div>
      <div class="cover-title-line2">Technische Oplevering</div>
    </div>

    <!-- Station info block bottom-left -->
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
          <span class="detail-value detail-highlight">${filledCount} / 40</span>
        </div>
        <div class="cover-detail">
          <span class="detail-label">Foto's</span>
          <span class="detail-value detail-highlight">${totalPhotos}</span>
        </div>
      </div>
      <!-- Progress bar -->
      <div class="cover-progress">
        <div class="cover-progress-track">
          <div class="cover-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="cover-progress-pct">${pct}%</span>
      </div>
    </div>

    <!-- Footer line -->
    <div class="cover-footer-line">
      <span>Terrevolt B.V.</span>
      <span class="cf-dot">·</span>
      <span>Liander Zuidoost</span>
      <span class="cf-dot">·</span>
      <span>${new Date().toLocaleDateString("nl-NL")}</span>
    </div>
  </div>
  `;

  // ── TABLE OF CONTENTS PAGE ─────────────────────────────
  pages += `
  <div class="page toc-page">
    <!-- Top banner -->
    <div class="toc-banner">
      <h2 class="toc-title">Inhoudsopgave</h2>
    </div>

    <div class="toc-content">
      <div class="toc-section-header">
        <span class="toc-section-num">01</span>
        <span class="toc-section-name">Foto Categorieën</span>
      </div>
      <div class="toc-items">
        ${categoriesWithFotos.map((cat, idx) => `
          <div class="toc-item">
            <span class="toc-item-num">${String(cat.id).padStart(2, "0")}</span>
            <span class="toc-item-name">${cat.name}</span>
            <span class="toc-item-dots"></span>
            <span class="toc-item-count">${cat.fotos.length} foto${cat.fotos.length !== 1 ? "'s" : ""}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="toc-footer">
      <span class="toc-footer-left">
        <span class="footer-dot"></span>
        TO Fotorapport · Terrevolt B.V.
      </span>
      <span class="toc-footer-right">p. 2</span>
    </div>
  </div>
  `;

  // ── PHOTO PAGES ─────────────────────────────────────────
  let pageNum = 3;

  for (const cat of categoriesWithFotos) {
    const chunks: Foto[][] = [];
    for (let i = 0; i < cat.fotos.length; i += 6) {
      chunks.push(cat.fotos.slice(i, i + 6));
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
        <!-- Green side accent -->
        <div class="page-side-accent"></div>

        <!-- Header -->
        <div class="photo-header">
          <div class="ph-left">
            <span class="ph-cat-num">${String(cat.id).padStart(2, "0")}</span>
            <span class="ph-cat-name">${cat.name}</span>
          </div>
          <div class="ph-right">
            <span class="ph-station">${station.naam_msr}</span>
          </div>
        </div>

        <!-- Photo grid -->
        <div class="photo-grid ${gridClass}" style="${gridStyle}">
          ${chunk.map((foto, i) => `
            <div class="photo-cell">
              <img src="${foto.url}" alt="Foto ${i + 1}" loading="eager"/>
            </div>
          `).join("")}
        </div>

        <!-- Footer -->
        <div class="photo-footer">
          <span class="pf-left">
            <span class="footer-dot"></span>
            TO Fotorapport · Terrevolt B.V.
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
   COVER PAGE — Dark green with decorative arcs
═══════════════════════════════════════ */
.cover-page {
  background: #003318;
  color: white;
}

/* Decorative arcs — layered curved stripes */
.deco-arc {
  position: absolute;
  border-radius: 50%;
  border: 3px solid rgba(28,176,80,0.25);
}
.deco-arc-1 {
  width: 600px; height: 600px;
  top: -120px; right: -200px;
  border-width: 4px;
  border-color: rgba(28,176,80,0.3);
}
.deco-arc-2 {
  width: 500px; height: 500px;
  top: -70px; right: -150px;
  border-width: 3px;
  border-color: rgba(28,176,80,0.2);
}
.deco-arc-3 {
  width: 450px; height: 450px;
  bottom: -100px; left: -150px;
  border-width: 4px;
  border-color: rgba(28,176,80,0.18);
}

/* Logo */
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

/* Center title */
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

/* Station info block */
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

/* Progress */
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

/* Cover footer */
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
  padding: 24px 48px;
  overflow: hidden;
}
.toc-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(90deg, #006e2d, #1cb050);
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}
.toc-section-num {
  font-size: 14px;
  font-weight: 900;
  background: rgba(255,255,255,0.2);
  padding: 2px 8px;
  border-radius: 6px;
}
.toc-section-name {
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.toc-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.toc-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 7px 4px;
  border-bottom: 1px solid #f0f2f5;
}
.toc-item:last-child { border-bottom: none; }
.toc-item-num {
  font-size: 11px;
  font-weight: 800;
  color: #006e2d;
  font-family: 'Courier New', monospace;
  min-width: 22px;
}
.toc-item-name {
  font-size: 12px;
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
  font-size: 11px;
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
   PHOTO PAGES
═══════════════════════════════════════ */
.photo-page { background: #ffffff; }

/* Green side accent (like the reference PDF's left bar) */
.page-side-accent {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 5px;
  background: linear-gradient(180deg, #006e2d 0%, #1cb050 60%, rgba(28,176,80,0.2) 100%);
  z-index: 2;
}

/* Header */
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
  background: #006e2d;
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
  gap: 8px;
}
.ph-station {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}

/* Photo grid */
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

/* Footer */
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

</body>
</html>`;
}
