export type RijUitkomst = { status: "aangemaakt" | "replay" | "bestaat" | "mislukt"; id?: string; fout?: string; pauze?: boolean };
export const afgerond = (r?: RijUitkomst) => !!r && r.status !== "mislukt";
export const previewPagina = <T,>(rijen: T[], pagina: number, grootte = 100) => rijen.slice(pagina * grootte, (pagina + 1) * grootte);
/** Exactly one outcome per row: refreshed previews cannot reclassify completed own work. */
export function importTellingen(rows: { regel: number; klasse: string }[], res: Record<number,RijUitkomst>) {
  const counts = { opgeslagen: 0, bestaat: 0, fout: 0, resterend: 0 };
  for (const row of rows) {
    const result = res[row.regel];
    if (result?.status === "aangemaakt" || result?.status === "replay") counts.opgeslagen++;
    else if (result?.status === "bestaat") counts.bestaat++;
    else if (result?.status === "mislukt" || row.klasse === "fout") counts.fout++;
    else if (row.klasse === "bestaat") counts.bestaat++;
    else counts.resterend++;
  }
  return counts;
}
/** Refreshed duplicate data must not suppress an own lost-response replay. */
export const resterendeImport = <T extends { regel: number; klasse: string }>(rows: T[], res: Record<number, RijUitkomst>, eigenAanvraag: (r: T) => boolean) =>
  rows.filter(r => !afgerond(res[r.regel]) && (["nieuw", "waarschuwing"].includes(r.klasse) || (r.klasse === "bestaat" && res[r.regel]?.status === "mislukt" && eigenAanvraag(r))));
/** Sequential batch with durable in-dialog outcomes. A cancelled/expired PIN or offline state stops the batch, not each row. */
export async function importBatch<T extends { regel: number }>(rijen: T[], resultaten: Record<number, RijUitkomst>, schrijf: (rij: T) => Promise<RijUitkomst>, online: () => boolean, wijzig: (r: Record<number, RijUitkomst>) => void) {
  const res = { ...resultaten };
  for (const r of rijen) {
    if (afgerond(res[r.regel])) continue;
    if (!online()) return { res, gepauzeerd: true };
    let x: RijUitkomst;
    try { x = await schrijf(r); } catch { x = { status: "mislukt", fout: "Verbinding onderbroken — probeer opnieuw", pauze: true }; }
    res[r.regel] = x; wijzig({ ...res });
    if (x.pauze) return { res, gepauzeerd: true };
  }
  return { res, gepauzeerd: false };
}