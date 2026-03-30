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

  // Progress bar segments (filled = green, empty = light)
  const segments = Array.from({ length: 40 }, (_, i) => i < filledCount);

  let pages = "";

  // ── COVER PAGE ──────────────────────────────────────────
  pages += `
  <div class="page cover-page">

    <!-- Top accent bar -->
    <div class="cover-top-bar"></div>

    <!-- Header area -->
    <div class="cover-header">
      <div class="cover-brand">
        <div class="brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M7 2L3 14h7l-2 8 11-12h-7l2-8z"/>
          </svg>
        </div>
        <span class="brand-name">TerreVolt</span>
      </div>
      <div class="cover-doc-label">FOTORAPPORT</div>
    </div>

    <!-- Main title card -->
    <div class="cover-title-card">
      <div class="title-accent-bar"></div>
      <div class="title-content">
        <div class="title-eyebrow">Technische Oplevering</div>
        <h1 class="title-main">${station.naam_msr}</h1>
        <div class="title-sub">
          <span class="type-chip ${isCS ? "chip-cs" : "chip-bs"}">${station.type_ruimte || "—"}</span>
          ${station.behuizingsnummer ? `<span class="title-behuizing">${station.behuizingsnummer}</span>` : ""}
        </div>
      </div>
    </div>

    <!-- Info grid -->
    <div class="cover-info-grid">
      <div class="info-cell">
        <div class="info-label">Datum</div>
        <div class="info-value">${station.datum || "—"}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Ingevuld door</div>
        <div class="info-value">${station.ingevuld_door || "—"}</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Categorieën</div>
        <div class="info-value info-green">${filledCount} / 40</div>
      </div>
      <div class="info-cell">
        <div class="info-label">Totaal foto's</div>
        <div class="info-value info-green">${totalPhotos}</div>
      </div>
    </div>

    <!-- Progress bar with dots -->
    <div class="cover-progress-section">
      <div class="progress-header">
        <span class="progress-label">Completering</span>
        <span class="progress-pct">${pct}%</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="progress-dots">
        ${segments.map((filled, i) => `<div class="pdot ${filled ? "pdot-on" : "pdot-off"}" title="${i + 1}"></div>`).join("")}
      </div>
    </div>

    <!-- Footer -->
    <div class="cover-footer">
      <span>Terrevolt B.V.</span>
      <span class="footer-sep">·</span>
      <span>Technische Oplevering</span>
      <span class="footer-sep">·</span>
      <span>Liander Zuidoost</span>
      <span class="footer-sep">·</span>
      <span>${new Date().toLocaleDateString("nl-NL")}</span>
    </div>

    <!-- Bottom accent -->
    <div class="cover-bottom-bar"></div>
  </div>
  `;

  // ── PHOTO PAGES ─────────────────────────────────────────
  let pageNum = 2;

  for (const cat of categoriesWithFotos) {
    // Smart chunking: 1=full, 2=2col, 3-4=2x2, 5-6=2x3
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

        <!-- Page header -->
        <div class="photo-header">
          <div class="photo-header-accent"></div>
          <div class="photo-header-content">
            <div class="photo-header-left">
              <span class="cat-number">${String(cat.id).padStart(2, "0")}</span>
              <span class="cat-name">${cat.name}</span>
            </div>
            <div class="photo-header-right">
              <span class="station-ref">${station.naam_msr}</span>
              ${station.behuizingsnummer ? `<span class="behuizing-ref">${station.behuizingsnummer}</span>` : ""}
            </div>
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

        <!-- Page footer -->
        <div class="photo-footer">
          <span class="footer-left">
            <span class="footer-dot"></span>
            TO Fotorapport · Terrevolt B.V.
          </span>
          <span class="footer-center">${station.naam_msr}</span>
          <span class="footer-right">
            ${station.datum || ""}
            <span class="footer-page">p. ${pageNum}</span>
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
  background: #f0f2f5;
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
  box-shadow: 0 8px 40px rgba(0,0,0,0.12);
}
.page:last-child { page-break-after: avoid; }

/* ═══════════════════════════════════════
   COVER PAGE
═══════════════════════════════════════ */
.cover-page { background: #ffffff; }

/* Top gradient bar */
.cover-top-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 6mm;
  background: linear-gradient(90deg, #004d1f 0%, #006e2d 50%, #1cb050 100%);
  z-index: 2;
}

/* Brand header */
.cover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20mm 18mm 0;
  position: relative;
  z-index: 1;
}
.cover-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-icon {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, #006e2d, #1cb050);
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(0,110,45,0.3);
}
.brand-name {
  font-size: 20px;
  font-weight: 900;
  color: #006e2d;
  letter-spacing: -0.5px;
}
.cover-doc-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 3px;
  color: #9ca3af;
  text-transform: uppercase;
}

/* Main title card */
.cover-title-card {
  margin: 8mm 18mm;
  background: #f7faf8;
  border: 1.5px solid #d1e8d6;
  border-radius: 18px;
  padding: 10mm 12mm;
  display: flex;
  align-items: stretch;
  gap: 14px;
}
.title-accent-bar {
  width: 5px;
  border-radius: 3px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #006e2d, #1cb050);
}
.title-content { flex: 1; }
.title-eyebrow {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 6px;
}
.title-main {
  font-size: 28px;
  font-weight: 900;
  line-height: 1.15;
  letter-spacing: -0.5px;
  color: #191c1e;
  margin-bottom: 10px;
}
.title-sub {
  display: flex;
  align-items: center;
  gap: 10px;
}
.type-chip {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 10px;
  border-radius: 20px;
}
.chip-cs { background: rgba(232,84,26,0.1); color: #c84415; }
.chip-bs { background: rgba(107,45,139,0.1); color: #6B2D8B; }
.title-behuizing {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  font-family: 'Courier New', monospace;
}

/* Info grid */
.cover-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0 18mm;
}
.info-cell {
  background: #f8f9fb;
  border: 1px solid #eaecef;
  border-radius: 12px;
  padding: 10px 14px;
}
.info-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #9ca3af;
  margin-bottom: 3px;
}
.info-value {
  font-size: 14px;
  font-weight: 800;
  color: #191c1e;
}
.info-green { color: #006e2d; }

/* Progress */
.cover-progress-section {
  margin: 6mm 18mm 0;
}
.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.progress-label {
  font-size: 11px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.progress-pct {
  font-size: 14px;
  font-weight: 900;
  color: #006e2d;
}
.progress-bar-track {
  height: 7px;
  background: #f0f2f5;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #006e2d, #1cb050);
  border-radius: 4px;
}
.progress-dots {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}
.pdot {
  width: 7px; height: 7px;
  border-radius: 50%;
}
.pdot-on { background: #1cb050; }
.pdot-off { background: #e5e7eb; }

/* Cover footer */
.cover-footer {
  position: absolute;
  bottom: 10mm;
  left: 0; right: 0;
  text-align: center;
  font-size: 9px;
  color: #9ca3af;
  font-weight: 500;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.footer-sep { color: #d1d5db; }

/* Bottom bar */
.cover-bottom-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 4mm;
  background: linear-gradient(90deg, #1cb050, #006e2d);
}

/* ═══════════════════════════════════════
   PHOTO PAGES
═══════════════════════════════════════ */
.photo-page { background: #ffffff; }

/* Header */
.photo-header {
  display: flex;
  align-items: center;
  height: 14mm;
  background: #f8f9fb;
  border-bottom: 1.5px solid #eaecef;
  flex-shrink: 0;
  overflow: hidden;
}
.photo-header-accent {
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, #006e2d, #1cb050);
  flex-shrink: 0;
}
.photo-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  padding: 0 14px;
}
.photo-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cat-number {
  font-size: 9px;
  font-weight: 800;
  color: #9ca3af;
  background: #eaecef;
  padding: 2px 6px;
  border-radius: 5px;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.5px;
}
.cat-name {
  font-size: 12px;
  font-weight: 800;
  color: #191c1e;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.photo-header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
}
.station-ref {
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
}
.behuizing-ref {
  font-size: 9px;
  font-weight: 500;
  color: #9ca3af;
  font-family: 'Courier New', monospace;
}

/* Photo grid */
.photo-grid {
  flex: 1;
  display: grid;
  gap: 8px;
  padding: 10px;
  min-height: 0;
}
.photo-cell {
  border-radius: 10px;
  overflow: hidden;
  background: #f0f2f5;
  border: 1px solid #eaecef;
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
  padding: 0 14px;
  border-top: 1px solid #eaecef;
  flex-shrink: 0;
  background: #fafbfc;
}
.footer-left {
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
.footer-center {
  font-size: 9px;
  font-weight: 700;
  color: #6b7280;
  text-align: center;
}
.footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 8px;
  font-weight: 500;
  color: #9ca3af;
}
.footer-page {
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
