export type RijUitkomst = { status: "aangemaakt" | "replay" | "bestaat" | "mislukt"; id?: string; fout?: string; pauze?: boolean };
export const afgerond = (r?: RijUitkomst) => !!r && r.status !== "mislukt";
export const previewPagina = <T,>(rijen: T[], pagina: number, grootte = 100) => rijen.slice(pagina * grootte, (pagina + 1) * grootte);
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