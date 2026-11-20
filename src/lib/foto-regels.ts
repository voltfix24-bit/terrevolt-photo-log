// Centrale regel: hoeveel foto's een categorie nodig heeft om "klaar" te zijn.
// Standaard 1 per categorie. Een hogere eis per categorie (bijv. 31 Stroomtransformatoren = 3)
// zet je hier pas aan als de gebruiker dat bevestigt; nu bewust leeg om bestaand gedrag te behouden.
export const STANDAARD_MIN_FOTOS = 1;
export const MIN_FOTOS_PER_CATEGORIE: Readonly<Record<number, number>> = {};

export function minFotos(categorieId: number): number {
  return MIN_FOTOS_PER_CATEGORIE[categorieId] ?? STANDAARD_MIN_FOTOS;
}

export function categorieKlaar(categorieId: number, aantalFotos: number): boolean {
  return aantalFotos >= minFotos(categorieId);
}
