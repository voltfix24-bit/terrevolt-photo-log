import { FOTO_CATEGORIEEN } from "./categories";

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
    .map((cat) => ({ name: cat, fotos: fotos.filter((f) => f.categorie === cat) }))
    .filter((c) => c.fotos.length > 0);

  const totalPhotos = fotos.length;
  const filledCount = categoriesWithFotos.length;

  let pages = "";

  // Cover page
  pages += `
    <div class="page cover">
      <div class="cover-bar-top"></div>
      <div class="cover-body">
        <div class="cover-badge">TERREVOLT B.V.</div>
        <div class="cover-title-block">
          <div class="cover-accent"></div>
          <div>
            <h1>Technische<br/>Oplevering</h1>
            <div class="cover-label">FOTORAPPORT</div>
          </div>
        </div>
        <table class="info-table">
          <tr><td class="label">Naam MSR</td><td class="value">${station.naam_msr}</td></tr>
          <tr><td class="label">Behuizingsnummer</td><td class="value mono">${station.behuizingsnummer || "—"}</td></tr>
          <tr><td class="label">Type ruimte</td><td class="value green">${station.type_ruimte || "—"}</td></tr>
          <tr><td class="label">Datum</td><td class="value">${station.datum || "—"}</td></tr>
          <tr><td class="label">Ingevuld door</td><td class="value">${station.ingevuld_door || "—"}</td></tr>
          <tr><td class="label">Categorieën</td><td class="value">${filledCount} / 40</td></tr>
          <tr><td class="label">Totaal foto's</td><td class="value green">${totalPhotos}</td></tr>
        </table>
      </div>
      <div class="cover-footer">Terrevolt B.V. · Technische Oplevering · Liander Zuidoost</div>
      <div class="cover-bar-bottom"></div>
    </div>
  `;

  // Photo pages — maximize page usage
  let pageNum = 2;
  for (const cat of categoriesWithFotos) {
    // 1 photo = full page, 2 photos = 1 col stacked, 3-4 = 2x2 grid, 5-6 = 2x3 grid
    const chunks: Foto[][] = [];
    for (let i = 0; i < cat.fotos.length; i += 6) {
      chunks.push(cat.fotos.slice(i, i + 6));
    }

    for (const chunk of chunks) {
      let gridClass = "grid-1";
      if (chunk.length === 2) gridClass = "grid-2";
      else if (chunk.length <= 4) gridClass = "grid-4";
      else gridClass = "grid-6";

      pages += `
        <div class="page">
          <div class="page-head">
            <div class="head-bar"></div>
            <div class="head-text">
              <span class="head-cat">${cat.name}</span>
              <span class="head-station">${station.naam_msr}${station.behuizingsnummer ? ' · ' + station.behuizingsnummer : ''}</span>
            </div>
          </div>
          <div class="photo-area ${gridClass}">
            ${chunk.map((foto) => `<div class="photo"><img src="${foto.url}"/></div>`).join("")}
          </div>
          <div class="page-foot">
            <span>TO Fotorapport · ${station.naam_msr}</span>
            <span>${station.datum || ""}</span>
            <span>pagina ${pageNum}</span>
          </div>
        </div>
      `;
      pageNum++;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>TO Fotorapport – ${station.naam_msr}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4 portrait; margin: 0; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #e9ecef; color: #1a1c1e; }

  /* ═══════ PAGE ═══════ */
  .page {
    width: 210mm; height: 297mm;
    margin: 0 auto; background: #fff;
    position: relative; overflow: hidden;
    page-break-after: always;
    display: flex; flex-direction: column;
  }

  /* ═══════ COVER ═══════ */
  .cover { justify-content: center; align-items: center; }
  .cover-bar-top {
    position: absolute; top: 0; left: 0; right: 0; height: 8mm;
    background: linear-gradient(90deg, #004d1f, #006e2d, #00a650);
  }
  .cover-bar-bottom {
    position: absolute; bottom: 0; left: 0; right: 0; height: 5mm;
    background: linear-gradient(90deg, #006e2d, #00a650);
  }
  .cover-body { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 0 40px; }
  .cover-badge {
    font-size: 11px; letter-spacing: 6px; text-transform: uppercase;
    color: #006e2d; font-weight: 700; background: #edf7f0;
    padding: 8px 24px; border-radius: 100px;
  }
  .cover-title-block {
    display: flex; align-items: stretch; gap: 20px;
    background: #f4faf5; border: 1.5px solid #c8e6cd; border-radius: 20px;
    padding: 36px 44px; max-width: 460px; width: 100%;
  }
  .cover-accent {
    width: 6px; border-radius: 3px; flex-shrink: 0;
    background: linear-gradient(180deg, #006e2d, #00a650);
  }
  .cover-title-block h1 {
    font-size: 36px; font-weight: 900; line-height: 1.1; color: #1a1c1e;
  }
  .cover-label {
    font-size: 16px; font-weight: 800; color: #006e2d;
    letter-spacing: 5px; text-transform: uppercase; margin-top: 10px;
  }

  .info-table {
    width: 100%; max-width: 460px; border-collapse: collapse;
    background: #f8f9fb; border: 1px solid #e2e5ea; border-radius: 14px;
    overflow: hidden;
  }
  .info-table tr { border-bottom: 1px solid #eef0f3; }
  .info-table tr:last-child { border-bottom: none; }
  .info-table td { padding: 11px 22px; font-size: 13px; }
  .info-table .label { color: #6b7280; font-weight: 500; width: 45%; }
  .info-table .value { font-weight: 700; color: #1a1c1e; text-align: right; }
  .info-table .value.green { color: #006e2d; }
  .info-table .value.mono { font-family: 'Courier New', monospace; letter-spacing: 0.5px; }

  .cover-footer {
    position: absolute; bottom: 16px; left: 0; right: 0; text-align: center;
    font-size: 9px; color: #9ca3af; font-weight: 500; letter-spacing: 1px;
  }

  /* ═══════ PHOTO PAGES ═══════ */
  .page-head {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px; background: #f4faf5;
    border-bottom: 1.5px solid #c8e6cd; flex-shrink: 0;
  }
  .head-bar {
    width: 5px; height: 28px; border-radius: 3px;
    background: linear-gradient(180deg, #006e2d, #00a650); flex-shrink: 0;
  }
  .head-text { flex: 1; display: flex; justify-content: space-between; align-items: center; }
  .head-cat { font-size: 13px; font-weight: 700; color: #1a1c1e; text-transform: uppercase; letter-spacing: 0.3px; }
  .head-station { font-size: 10px; color: #6b7280; font-weight: 500; }

  .photo-area {
    flex: 1; padding: 12px; display: grid; gap: 10px;
    min-height: 0; /* allow shrinking */
  }

  /* Grid variants — fill the entire available area */
  .grid-1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
  .grid-2 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .grid-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .grid-6 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; }

  .photo {
    border-radius: 8px; overflow: hidden; background: #f0f2f5;
    border: 1px solid #e2e5ea; min-height: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .photo img {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }

  .page-foot {
    padding: 8px 20px; display: flex; justify-content: space-between;
    font-size: 9px; color: #9ca3af; border-top: 1px solid #eef0f3;
    font-weight: 500; flex-shrink: 0;
  }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;z-index:100;background:linear-gradient(135deg,#006e2d,#00a650);color:#fff;border:none;padding:14px 28px;border-radius:14px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:700;font-size:14px;box-shadow:0 6px 24px rgba(0,110,45,0.35);">
🖨 Opslaan als PDF
</button>
${pages}
</body>
</html>`;
}
