import JSZip from "jszip";
import { saveAs } from "file-saver";
import { CATEGORIES } from "./categories";

interface Foto {
  id: string;
  categorie: string;
  url: string;
}

function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").replace(/\s+/g, "_").substring(0, 60);
}

export async function downloadStationZip(
  stationName: string,
  fotos: Foto[],
  onProgress?: (pct: number) => void
) {
  const zip = new JSZip();
  const total = fotos.length;
  let done = 0;

  // Group by categorie
  const grouped = new Map<string, Foto[]>();
  for (const foto of fotos) {
    const existing = grouped.get(foto.categorie) ?? [];
    existing.push(foto);
    grouped.set(foto.categorie, existing);
  }

  for (const [categorie, catFotos] of grouped) {
    const cat = CATEGORIES.find((c) => c.name === categorie);
    const catNum = cat ? String(cat.id).padStart(2, "0") : "00";
    const catSlug = slugify(categorie);

    for (let i = 0; i < catFotos.length; i++) {
      const foto = catFotos[i];
      try {
        const response = await fetch(foto.url);
        const blob = await response.blob();
        const ext = blob.type === "image/png" ? "png" : "jpg";
        const fileName =
          catFotos.length === 1
            ? `${catNum}_${catSlug}.${ext}`
            : `${catNum}_${catSlug}_${i + 1}.${ext}`;
        zip.file(fileName, blob);
      } catch {
        // skip failed downloads
      }
      done++;
      onProgress?.(Math.round((done / total) * 100));
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  const safeStationName = slugify(stationName);
  saveAs(content, `TO_Fotos_${safeStationName}.zip`);
}
