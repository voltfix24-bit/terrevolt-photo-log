export interface Station {
  naam_msr: string;
  behuizingsnummer: string | null;
  type_ruimte: string | null;
  datum: string | null;
  ingevuld_door: string | null;
}

export interface Foto {
  id: string;
  categorie: string;
  url: string;
  uploaded_at?: string;
}

export interface PdfBranding {
  bedrijfsnaam?: string;
  regio?: string;
  logo_url?: string | null;
  primary_color?: string;
  primary_light_color?: string;
}
export type Opmerking = { categorie: string; opmerking: string };
export type Skip = { categorie: string; reden: string };
