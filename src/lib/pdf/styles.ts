import type { PdfContext } from "./layout";

/** Stylesheet van het HTML-rapport (huisstijlkleuren uit de context). */
export function pdfStyles(ctx: PdfContext): string {
  const { primaryCss, primaryLightCss, coverBg, arcColor, arcColor1, arcColor2, arcColor3, pct } = ctx;
  return `
/* ── RESET ── */
@page { size: A4 portrait; margin: 0; }
@media print {
  .no-print { display: none !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
  .page { box-shadow: none !important; margin: 0 !important; }
  .rapport { zoom: 1 !important; width: auto !important; padding: 0 !important; }
}
/* Schermpreview: A4-inhoud wordt via zoom op apparaatbreedte gepast; knop blijft op echte maat. */
.rapport { width: 820px; margin: 0 auto; padding: 13px 0 0; }
@media screen and (min-width: 820px) { .rapport { width: auto; } }
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
  background: linear-gradient(135deg, ${primaryCss}, ${primaryLightCss});
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px ${arcColor1};
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
  color: ${primaryLightCss};
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
  background: linear-gradient(90deg, ${primaryCss}, ${primaryLightCss});
  border-radius: 3px;
}
.cover-progress-pct {
  font-size: 13px;
  font-weight: 900;
  color: ${primaryLightCss};
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
  background: ${coverBg};
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
  color: ${primaryCss};
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
  color: ${primaryCss};
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
.photo-timestamp {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0,0,0,0.55);
  color: white;
  font-size: 7px;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.2px;
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
  background: ${primaryLightCss};
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
  color: ${primaryCss};
  font-size: 9px;
}

/* ── PRINT BUTTON ── */
.print-btn {
  position: fixed;
  top: max(12px, env(safe-area-inset-top)); right: 12px;
  min-height: 48px;
  z-index: 9999;
  background: linear-gradient(135deg, ${primaryCss}, ${primaryLightCss});
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 14px;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 16px;
  box-shadow: 0 8px 28px ${arcColor1};
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s;
}
.print-btn:hover { transform: translateY(-1px); box-shadow: 0 12px 32px ${arcColor1}; }
.print-btn:active { transform: scale(0.97); }

@media print {
  .photo-cell img {
    image-rendering: auto;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;
}
