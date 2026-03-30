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
    <div class="pdf-page cover">
      <div class="cover-top-bar"></div>

      <div class="cover-content">
        <p class="cover-subtitle">Terrevolt B.V.</p>

        <div class="title-card">
          <div class="title-accent"></div>
          <h1>Technische<br/>Oplevering</h1>
          <p class="title-label">FOTORAPPORT</p>
        </div>

        <div class="info-card">
          <div class="info-row"><span class="info-label">Naam MSR</span><span class="info-value">${station.naam_msr}</span></div>
          <div class="info-row"><span class="info-label">Behuizingsnummer</span><span class="info-value mono">${station.behuizingsnummer || "—"}</span></div>
          <div class="info-row"><span class="info-label">Type ruimte</span><span class="info-value accent">${station.type_ruimte || "—"}</span></div>
          <div class="info-row"><span class="info-label">Datum</span><span class="info-value">${station.datum || "—"}</span></div>
          <div class="info-row"><span class="info-label">Ingevuld door</span><span class="info-value">${station.ingevuld_door || "—"}</span></div>
          <div class="info-row last"><span class="info-label">Categorieën</span><span class="info-value">${filledCount} / 40</span></div>
          <div class="info-row last"><span class="info-label">Totaal foto's</span><span class="info-value accent">${totalPhotos}</span></div>
        </div>
      </div>

      <p class="cover-footer">Terrevolt B.V. · Technische Oplevering · Liander Zuidoost</p>
      <div class="cover-bottom-bar"></div>
    </div>
  `;

  // Photo pages
  let pageNum = 2;
  for (const cat of categoriesWithFotos) {
    const chunks: Foto[][] = [];
    for (let i = 0; i < cat.fotos.length; i += 6) {
      chunks.push(cat.fotos.slice(i, i + 6));
    }

    for (const chunk of chunks) {
      const cols = chunk.length === 1 ? "1fr" : "1fr 1fr";
      const maxH = chunk.length <= 2 ? "380px" : "220px";

      pages += `
        <div class="pdf-page">
          <div class="page-header">
            <div class="header-accent"></div>
            <div class="header-content">
              <p class="header-cat">${cat.name}</p>
              <p class="header-station">${station.naam_msr}</p>
            </div>
          </div>
          <div class="photo-grid" style="grid-template-columns:${cols};">
            ${chunk
              .map(
                (foto) => `
              <div class="photo-card">
                <img src="${foto.url}" style="max-height:${maxH};" />
              </div>
            `
              )
              .join("")}
          </div>
          <div class="page-footer">
            <span>TO Fotorapport · ${station.naam_msr} · ${station.datum || ""}</span>
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
<title>TO Fotorapport - ${station.naam_msr}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4 portrait; margin: 0; }
  @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #f0f2f5; color: #191c1e; }

  .pdf-page {
    width: 210mm; min-height: 297mm; margin: 0 auto;
    background: #ffffff; position: relative;
    page-break-after: always;
    display: flex; flex-direction: column;
  }

  /* ---- Cover ---- */
  .cover { justify-content: center; align-items: center; }
  .cover-top-bar { position: absolute; top: 0; left: 0; right: 0; height: 6mm; background: linear-gradient(90deg, #006e2d, #00a650); }
  .cover-bottom-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 4mm; background: #e8eaf0; }
  .cover-content { display: flex; flex-direction: column; align-items: center; gap: 28px; }
  .cover-subtitle { font-size: 13px; letter-spacing: 5px; text-transform: uppercase; color: #6b7280; font-weight: 600; }

  .title-card {
    background: #f6faf7; border: 1px solid #d4e8da; border-radius: 20px;
    padding: 44px 52px; text-align: center; position: relative; overflow: hidden;
    max-width: 440px; width: 90%;
  }
  .title-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 5mm; background: linear-gradient(180deg, #006e2d, #00a650); border-radius: 20px 0 0 20px; }
  .title-card h1 { font-size: 34px; font-weight: 800; color: #191c1e; line-height: 1.15; margin: 0 0 10px; }
  .title-label { font-size: 18px; font-weight: 700; color: #006e2d; text-transform: uppercase; letter-spacing: 4px; margin: 0; }

  .info-card {
    background: #f8f9fb; border: 1px solid #e2e5ea; border-radius: 16px;
    padding: 20px 28px; max-width: 440px; width: 90%;
  }
  .info-row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #eef0f3; font-size: 13px; }
  .info-row.last { border-bottom: none; }
  .info-label { color: #6b7280; font-weight: 500; }
  .info-value { font-weight: 600; color: #191c1e; }
  .info-value.accent { color: #006e2d; font-weight: 700; }
  .info-value.mono { font-family: 'Courier New', monospace; letter-spacing: 0.5px; }

  .cover-footer { position: absolute; bottom: 18px; font-size: 10px; color: #9ca3af; font-weight: 500; }

  /* ---- Photo pages ---- */
  .page-header {
    background: #f6faf7; border-bottom: 1px solid #d4e8da;
    padding: 16px 24px; display: flex; align-items: center; gap: 14px;
  }
  .header-accent { width: 5mm; height: 34px; background: linear-gradient(180deg, #006e2d, #00a650); border-radius: 3px; flex-shrink: 0; }
  .header-content { flex: 1; display: flex; justify-content: space-between; align-items: center; }
  .header-cat { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #191c1e; margin: 0; }
  .header-station { font-size: 11px; color: #6b7280; margin: 0; font-weight: 500; }

  .photo-grid { flex: 1; padding: 24px; display: grid; gap: 16px; align-content: start; }
  .photo-card { border-radius: 12px; overflow: hidden; background: #f0f2f5; border: 1px solid #e2e5ea; }
  .photo-card img { width: 100%; height: auto; object-fit: cover; display: block; }

  .page-footer {
    padding: 12px 24px; display: flex; justify-content: space-between;
    font-size: 10px; color: #9ca3af; border-top: 1px solid #eef0f3; font-weight: 500;
  }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;z-index:100;background:#006e2d;color:#fff;border:none;padding:12px 24px;border-radius:12px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:700;font-size:14px;box-shadow:0 4px 16px rgba(0,110,45,0.3);">
🖨 Opslaan als PDF
</button>
${pages}
</body>
</html>`;
}
