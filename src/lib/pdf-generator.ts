// Dunne facade: het HTML-rapport is opgesplitst in src/lib/pdf/ (types, sanitize, layout, sections, styles, build).
import { bouwPdfHtml } from "./pdf/build";
import { saneerInvoer } from "./pdf/sanitize";
import type { Foto, Opmerking, PdfBranding, Skip, Station } from "./pdf/types";

export { escHtml, veiligeUrl, veiligHsl } from "./pdf/sanitize";
export type { PdfBranding } from "./pdf/types";

export function generatePdfHtml(station: Station, fotos: Foto[], branding?: PdfBranding, opmerkingen?: Opmerking[], skips?: Skip[]): string {
  const { s, f, b, o, k } = saneerInvoer(station, fotos, branding, opmerkingen, skips);
  return bouwPdfHtml(s, f, b, o, k);
}
