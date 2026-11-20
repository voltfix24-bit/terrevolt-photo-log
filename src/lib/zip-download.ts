import JSZip from "jszip";
import { saveAs } from "file-saver";
import { CATEGORIES } from "./categories";

interface Foto {
  id: string;
  categorie: string;
  url: string;
}

export type ZipResultaat = { totaal: number; gelukt: number; mislukt: number };

export function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").trim().replace(/\s+/g, "_").substring(0, 60) || "station";
}

/** Bestandsnamen per foto, uniek binnen de zip. */
export function zipNamen(fotos: Foto[], ext: (f: Foto) => string = () => "jpg"): Map<string, string> {
  const perCat = new Map<string, Foto[]>();
  for (const f of fotos) perCat.set(f.categorie, [...(perCat.get(f.categorie) ?? []), f]);
  const namen = new Map<string, string>();
  const gebruikt = new Set<string>();
  for (const [categorie, lijst] of perCat) {
    const cat = CATEGORIES.find((c) => c.name === categorie);
    const basis = `${cat ? String(cat.id).padStart(2, "0") : "00"}_${slugify(categorie)}`;
    lijst.forEach((f, i) => {
      let naam = lijst.length === 1 ? `${basis}.${ext(f)}` : `${basis}_${i + 1}.${ext(f)}`;
      for (let n = 2; gebruikt.has(naam); n++) naam = `${basis}_${i + 1}_${n}.${ext(f)}`;
      gebruikt.add(naam); namen.set(f.id, naam);
    });
  }
  return namen;
}

/**
 * Download alle foto's (max 4 tegelijk) in één zip. Mislukte foto's worden geteld en gemeld;
 * mislukken ze allemaal, dan wordt er geen zip gemaakt en volgt een fout.
 */
export async function downloadStationZip(
  stationName: string,
  fotos: Foto[],
  onProgress?: (pct: number) => void,
  haal: typeof fetch = fetch,
  bewaar: (b: Blob, naam: string) => void = saveAs,
): Promise<ZipResultaat> {
  if (fotos.length === 0) throw new Error("Geen foto's");
  const zip = new JSZip();
  const namen = zipNamen(fotos);
  const mislukte: string[] = [];
  let klaar = 0;
  let volgende = 0;

  const werker = async () => {
    while (volgende < fotos.length) {
      const foto = fotos[volgende++];
      try {
        const r = await haal(foto.url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        if (blob.size === 0) throw new Error("leeg bestand");
        const naam = namen.get(foto.id)!;
        zip.file(blob.type === "image/png" ? naam.replace(/\.jpg$/, ".png") : naam, blob);
      } catch {
        mislukte.push(foto.id);
      }
      klaar++;
      onProgress?.(Math.round((klaar / fotos.length) * 100));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, fotos.length) }, werker));

  const res = { totaal: fotos.length, gelukt: fotos.length - mislukte.length, mislukt: mislukte.length };
  if (res.gelukt === 0) throw new Error("Geen enkele foto kon worden gedownload");
  if (res.mislukt > 0) zip.file("ONTBREKENDE_FOTOS.txt", `${res.mislukt} van ${res.totaal} foto's konden niet worden gedownload.\n`);
  const content = await zip.generateAsync({ type: "blob" });
  bewaar(content, `TO_Fotos_${slugify(stationName)}.zip`);
  return res;
}
