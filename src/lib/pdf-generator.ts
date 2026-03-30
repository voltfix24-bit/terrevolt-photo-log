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

  let pages = "";

  // Cover page
  pages += `
    <div class="pdf-page" style="display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;">
      <div style="position:absolute;top:0;left:0;right:0;height:5mm;background:#E8541A;"></div>
      <div style="position:absolute;bottom:0;left:0;right:0;height:4mm;background:#6B2D8B;"></div>

      <p style="font-size:12px;letter-spacing:4px;text-transform:uppercase;color:#6b7280;margin-bottom:24px;">Terrevolt B.V.</p>

      <div style="background:#181c27;border-radius:14px;padding:40px 48px;text-align:center;position:relative;overflow:hidden;max-width:440px;width:90%;">
        <div style="position:absolute;left:0;top:0;bottom:0;width:4mm;background:#E8541A;border-radius:14px 0 0 14px;"></div>
        <h1 style="font-size:32px;font-weight:700;margin:0 0 8px;">Technische<br/>Oplevering</h1>
        <p style="font-size:20px;font-weight:600;color:#E8541A;text-transform:uppercase;letter-spacing:3px;margin:0;">FOTORAPPORT</p>
      </div>

      <div style="background:#181c27;border-radius:14px;padding:24px 32px;margin-top:32px;max-width:440px;width:90%;">
        <div class="info-row"><span class="info-label">Naam MSR</span><span class="info-value">${station.naam_msr}</span></div>
        <div class="info-row"><span class="info-label">Behuizingsnummer</span><span class="info-value">${station.behuizingsnummer || "—"}</span></div>
        <div class="info-row"><span class="info-label">Type ruimte</span><span class="info-value" style="color:#E8541A;">${station.type_ruimte || "—"}</span></div>
        <div class="info-row"><span class="info-label">Datum</span><span class="info-value">${station.datum || "—"}</span></div>
        <div class="info-row"><span class="info-label">Ingevuld door</span><span class="info-value">${station.ingevuld_door || "—"}</span></div>
        <div class="info-row" style="border:none;"><span class="info-label">Totaal foto's</span><span class="info-value">${totalPhotos}</span></div>
      </div>

      <p style="position:absolute;bottom:20px;font-size:10px;color:#6b7280;">
        Terrevolt B.V. · Technische Oplevering · Liander Zuidoost
      </p>
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
        <div class="pdf-page" style="display:flex;flex-direction:column;">
          <div style="background:#181c27;padding:16px 24px;display:flex;align-items:center;gap:12px;">
            <div style="width:4mm;height:32px;background:#E8541A;border-radius:2px;flex-shrink:0;"></div>
            <div style="flex:1;display:flex;justify-content:space-between;align-items:center;">
              <p style="font-size:14px;font-weight:700;text-transform:uppercase;margin:0;">${cat.name}</p>
              <p style="font-size:11px;color:#6b7280;margin:0;">${station.naam_msr}</p>
            </div>
          </div>
          <div style="flex:1;padding:24px;display:grid;grid-template-columns:${cols};gap:16px;align-content:start;">
            ${chunk
              .map(
                (foto) => `
              <div style="border-radius:8px;overflow:hidden;background:#181c27;">
                <img src="${foto.url}" style="width:100%;height:auto;max-height:${maxH};object-fit:cover;display:block;" />
              </div>
            `
              )
              .join("")}
          </div>
          <div style="padding:12px 24px;display:flex;justify-content:space-between;font-size:10px;color:#6b7280;">
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
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4 portrait; margin: 0; }
  @media print { .no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #0f1117; color: #e8eaf0; }
  .pdf-page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #0f1117; position: relative; page-break-after: always; color: #e8eaf0; }
  .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #2a3050; font-size: 13px; }
  .info-label { color: #6b7280; }
  .info-value { font-weight: 500; }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;z-index:100;background:#E8541A;color:#fff;border:none;padding:10px 20px;border-radius:9px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;font-size:14px;">
🖨 Opslaan als PDF
</button>
${pages}
</body>
</html>`;
}
