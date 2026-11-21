export type DossierDraft = { tekst: string; versie: number; token: string };
export const nieuwConcept = (tekst: string, versie: number): DossierDraft => ({ tekst, versie, token: crypto.randomUUID() });
export function leesConcept(key: string): DossierDraft | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (typeof parsed.tekst !== "string" || typeof parsed.versie !== "number") return null;
  return { ...parsed, token: parsed.token ?? crypto.randomUUID() };
}
/** A response may acknowledge only its own local operation, never another tab's draft. */
export function bevestigConcept(key: string, sent: DossierDraft, current: DossierDraft, versie: number) {
  const stored = leesConcept(key);
  if (stored?.token === sent.token) localStorage.removeItem(key);
  else if (stored?.token === current.token && current.token !== sent.token) localStorage.setItem(key, JSON.stringify({ ...current, versie }));
}
export function verwijderConcept(key: string, token: string) {
  if (leesConcept(key)?.token === token) localStorage.removeItem(key);
}