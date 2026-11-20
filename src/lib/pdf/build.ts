import { pdfContext } from "./layout";
import { coverPage, photoPages, tocPage } from "./sections";
import { pdfStyles } from "./styles";
import type { Foto, Opmerking, PdfBranding, Skip, Station } from "./types";

/** Bouwt het rapport uit al gesaneerde invoer. */
export function bouwPdfHtml(station: Station, fotos: Foto[], branding?: PdfBranding, opmerkingen?: Opmerking[], skips?: Skip[]): string {
  const ctx = pdfContext(station, fotos, branding);
  let pages = "";
  pages += coverPage(ctx, station);
  pages += tocPage(ctx, skips);
  pages += photoPages(ctx, station, opmerkingen, skips);
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<title>TO Fotorapport – ${station.naam_msr}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
${pdfStyles(ctx)}
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
