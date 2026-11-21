import { categorieKlaar } from "@/lib/foto-regels";

export type WerkfaseInvoer = {
  status: string | null;
  submittedAt: string | null;
  reviewReden: string | null;
  categorieen: ReadonlyArray<{ id: number; name: string }>;
  /** Serverfoto's (niet-afgekeurd) per categorienaam; null = nog niet geladen. */
  fotosPerCategorie: Readonly<Record<string, number>> | null;
  /** N.v.t.-markeringen van de server; null = nog niet geladen. */
  overgeslagen: ReadonlySet<string> | null;
  /** Aantal afgekeurde foto's; null = onbekend. */
  afgekeurd: number | null;
  /** Alle lokale wachtrij-items van dit station (ook verstuurd); null = onbekend/onleesbaar. */
  lokaal: number | null;
  /** Foto's die nu worden voorbereid/bewaard. */
  bewaren: number;
  leesFout: boolean;
};

export type Werkfase =
  | { soort: "laden" }
  | { soort: "leesfout" }
  | { soort: "nieuw"; totaal: number; volgende: { id: number; name: string } }
  | { soort: "bezig"; ingevuld: number; totaal: number; volgende: { id: number; name: string } }
  | { soort: "ingevuld"; totaal: number; fotos: number }
  | { soort: "opgeleverd" }
  | { soort: "goedgekeurd" };

/** Eerlijke werkfase van een station; categorieKlaar + N.v.t. bepalen "ingevuld", nooit het fotoaantal. */
export function stationWerkfase(i: WerkfaseInvoer): Werkfase {
  if (i.status === "goedgekeurd") return { soort: "goedgekeurd" };
  if (i.status === "opgeleverd") return { soort: "opgeleverd" };
  if (i.leesFout) return { soort: "leesfout" };
  if (!i.fotosPerCategorie || !i.overgeslagen || i.categorieen.length === 0) return { soort: "laden" };
  const fotos = i.fotosPerCategorie, skip = i.overgeslagen;
  const klaar = (c: { id: number; name: string }) => categorieKlaar(c.id, fotos[c.name] ?? 0) || skip.has(c.name);
  const totaal = i.categorieen.length;
  const ingevuld = i.categorieen.filter(klaar).length;
  const aantalFotos = i.categorieen.reduce((n, c) => n + (fotos[c.name] ?? 0), 0);
  const volgende = i.categorieen.find((c) => !klaar(c));
  if (!volgende) return { soort: "ingevuld", totaal, fotos: aantalFotos };
  const begonnen = ingevuld > 0 || aantalFotos > 0 || skip.size > 0 || !!i.submittedAt || !!i.reviewReden?.trim()
    || i.afgekeurd !== 0 || i.lokaal !== 0 || i.bewaren > 0;
  return begonnen ? { soort: "bezig", ingevuld, totaal, volgende } : { soort: "nieuw", totaal, volgende };
}
