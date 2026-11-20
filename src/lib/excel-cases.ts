import { normaliseer, nrSleutel } from "@/lib/case-service";

export type ImportRij = { casenummer: string; casenaam: string; wv: string; status: "nieuw" | "bestaat" | "dubbel" | "onvolledig" };

const kolom = (koppen: string[], ...zoek: RegExp[]) => koppen.findIndex((k) => zoek.every((z) => z.test(k)));

/** Zet Excel-rijen (eerste rij = koppen) om naar importregels; bestaande en dubbele casenummers worden gemarkeerd, niet geïmporteerd. */
export function leesImportRijen(rijen: unknown[][], bestaand: Iterable<string>): ImportRij[] {
  if (!rijen.length) return [];
  const koppen = rijen[0].map((k) => normaliseer(String(k ?? "")).toLowerCase());
  const iNr = kolom(koppen, /case/, /n(umme)?r/);
  const iNaam = kolom(koppen, /case/, /naam/);
  const iWv = koppen.findIndex((k) => /^wv\b|werkvoorbereid/.test(k));
  if (iNr < 0 || iNaam < 0) throw new Error("Kolommen 'Casenummer' en 'Casenaam' niet gevonden in de eerste rij");
  const al = new Set([...bestaand].map(nrSleutel));
  const gezien = new Set<string>();
  return rijen.slice(1)
    .map((r) => ({ casenummer: normaliseer(String(r[iNr] ?? "")), casenaam: normaliseer(String(r[iNaam] ?? "")), wv: iWv >= 0 ? normaliseer(String(r[iWv] ?? "")) : "" }))
    .filter((r) => r.casenummer || r.casenaam)
    .map((r) => {
      const k = nrSleutel(r.casenummer);
      const status: ImportRij["status"] = !r.casenummer || !r.casenaam ? "onvolledig" : al.has(k) ? "bestaat" : gezien.has(k) ? "dubbel" : "nieuw";
      gezien.add(k);
      return { ...r, status };
    });
}
