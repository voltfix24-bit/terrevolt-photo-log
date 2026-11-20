// Centrale regel: hoeveel foto's een categorie nodig heeft om "klaar" te zijn.
// Definitief: standaard één foto, ook voor categorie 31 (Stroomtransformatoren).
export const STANDAARD_MIN_FOTOS = 1;
export const MIN_FOTOS_PER_CATEGORIE: Readonly<Record<number, number>> = {};

export function minFotos(categorieId: number): number {
  return MIN_FOTOS_PER_CATEGORIE[categorieId] ?? STANDAARD_MIN_FOTOS;
}

export function categorieKlaar(categorieId: number, aantalFotos: number): boolean {
  return aantalFotos >= minFotos(categorieId);
}
