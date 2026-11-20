import { toast } from "sonner";

export const INTERNET_NODIG = "Internet vereist — offline kun je alleen foto's en categorienotities bewaren.";

/** Controleer op het moment van de actie, niet alleen bij het openen van een scherm. */
export function internetVereist(): boolean {
  if (navigator.onLine) return true;
  toast.error(INTERNET_NODIG);
  return false;
}