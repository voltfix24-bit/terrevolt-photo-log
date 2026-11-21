export const normaliseer = (v?: string | null) => (v ?? "").replace(/\s+/g, " ").trim();
export const nrSleutel = (v?: string | null) => normaliseer(v).toLowerCase();
type Invoer = { casenummer: string; casenaam: string; uitvoerder?: string; wv?: string; notitie?: string; ronde?: number; toStatus?: string; ingediendOp?: string | null; onHoldReden?: string };
export function valideerCase(c: Invoer): string | null {
  if (!normaliseer(c.casenummer)) return "Casenummer is verplicht";
  if (!normaliseer(c.casenaam)) return "Casenaam is verplicht";
  if (normaliseer(c.casenummer).length > 100 || normaliseer(c.casenaam).length > 300 || (c.wv ?? "").length > 300 || (c.notitie ?? "").trim().length > 4000 || (c.onHoldReden ?? "").length > 1000) return "Invoer te lang";
  const ronde = c.ronde ?? 1;
  if (!Number.isInteger(ronde) || ronde < 1 || ronde > 50) return "Ongeldige ronde";
  if (c.toStatus && !["open", "controle", "afgekeurd", "goedgekeurd"].includes(c.toStatus)) return "Ongeldige TO-status";
  if (c.ingediendOp) {
    const d = new Date(`${c.ingediendOp}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.ingediendOp) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== c.ingediendOp || c.ingediendOp < "1990-01-01" || c.ingediendOp > "2100-12-31") return "Ongeldige datum";
  }
  return null;
}