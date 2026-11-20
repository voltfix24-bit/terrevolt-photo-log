export const MAX_FOTO_BYTES = 10 * 1024 * 1024;
export const FOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp"];

/** Geeft een foutmelding als het bestand niet geüpload mag worden, anders null. */
export function fotoFout(file: { name: string; size: number; type: string }): string | null {
  if (file.size > MAX_FOTO_BYTES) return `${file.name} is groter dan 10MB`;
  if (!FOTO_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) return `${file.name}: ongeldig bestandstype`;
  return null;
}
