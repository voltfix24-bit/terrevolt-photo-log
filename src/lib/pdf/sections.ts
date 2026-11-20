import { CATEGORIES, SECTIONS } from "../categories";
import type { PdfContext } from "./layout";
import type { Foto, Opmerking, Skip, Station } from "./types";

// ── Voorblad ──
export function coverPage(ctx: PdfContext, station: Station): string {
  const { bedrijfsnaam, regio, logoUrl, totalPhotos, filledCount, totalCats, pct, isCS } = ctx;
  return `
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
}

// ── Inhoudsopgave ──
export function tocPage(ctx: PdfContext, skips?: Skip[]): string {
  const { bedrijfsnaam, categoriesWithFotos, sectionGroups } = ctx;
  return `
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
      ${skips?.length ? `<div style="margin-top:16px;padding:12px 14px;border:1px solid #dde5dc;border-radius:8px;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#617067;margin-bottom:8px;">Niet van toepassing</div>
        ${skips.map(skip => `<div style="display:flex;gap:8px;padding:5px 0;border-top:1px solid #edf1ed;font-size:10px;"><strong>${skip.categorie}</strong><span style="color:#617067;">${skip.reden}</span></div>`).join('')}
      </div>` : ''}
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
}

// ── Fotopagina's per sectie (met scheidingspagina's) ──
export function photoPages(ctx: PdfContext, station: Station, opmerkingen?: Opmerking[], skips?: Skip[]): string {
  const { bedrijfsnaam, categoriesWithFotos, sectionGroups } = ctx;
  let pages = "";
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
                ${foto.uploaded_at ? `<div class="photo-timestamp">${new Date(foto.uploaded_at).toLocaleDateString('nl-NL')} ${new Date(foto.uploaded_at).toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'})}</div>` : ''}
              </div>
            `).join("")}
          </div>

          ${(() => {
            const opmerking = opmerkingen?.find(o => o.categorie === catData.name);
            if (!opmerking) return '';
            return `<div style="margin:8px 10px 0;padding:8px 12px;background:#fffbf0;border:1px solid #f0e0a0;border-left:3px solid #d4a017;border-radius:8px;font-size:10px;color:#5a4a00;line-height:1.5;">
              <div style="font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#8a6a00;margin-bottom:3px;">📝 Opmerking</div>
              ${opmerking.opmerking}
            </div>`;
          })()}

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
  return pages;
}
