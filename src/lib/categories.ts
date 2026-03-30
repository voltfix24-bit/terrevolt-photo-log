export const FOTO_CATEGORIEEN = [
  "Typeplaatje / fabricagenummer",
  "Ruimte overzicht (Buiten)",
  "Deuren met stationsbenaming",
  "Lips-sloten",
  "Overzicht binnenzijde (LS & MS)",
  "Foto Kelder",
  "Overzichtsfoto kabelinvoer",
  "Overzicht MS installatie",
  "Foto per veld",
  "Typeplaatje schakelaar",
  "Foto testrapport",
  "Typeplaatjes MS schakelaar",
  "Aarding schakelaar",
  "Stroomtrafo's vermogensveld",
  "DA-kast",
  "Eindsluitingen MS",
  "MS-moffen",
  "Trafo typeplaatje",
  "Trafo overzicht",
  "Trafo bovenzijde / eindsluitingen",
  "Tapstand trafo",
  "Nul-aarde koppeling",
  "Richtingsbord kabelnummers",
  "LS-installatie overzichtsfoto's",
  "Typeplaatje LS rek",
  "Typeplaatje voedende strook",
  "Zekering waarde voedende strook",
  "Kabelnummers met mes-patroon",
  "LS eindsluitingen en hulpaders",
  "TMA",
  "Stroomtransformatoren",
  "Overzicht OVL gedeelte",
  "Zekering waarde OV beveiliging",
  "Flex-OV Modem",
  "Flex-OV Router",
  "Verlichting WCD",
  "Stationsaarding",
  "Ringleiding aarding",
  "Aarding metalen delen",
  "NSA-Luik",
] as const;

export type FotoCategorie = typeof FOTO_CATEGORIEEN[number];

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
