// Notities (categorie_opmerkingen) opslaan met een eenvoudige offline-wachtrij in localStorage.
import { supabase } from "@/integrations/supabase/client";

const KEY = "notitie-wachtrij-v1";
type Item = { stationId: string; categorie: string; tekst: string };
export type NotitieStatus = "online" | "wachtrij" | "beheer";
type Bewaard = Item & { versie?: string; fout?: "beheer" | "verbinding" };
const BEWAAR_FOUT = "Notitie niet bewaard op dit apparaat. Houd dit venster open en probeer opnieuw; mogelijk is de opslag vol.";
const lees = (): Record<string, Bewaard> => {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
  catch { throw new Error(BEWAAR_FOUT); }
};
const schrijf = (q: Record<string, Bewaard>) => {
  try { localStorage.setItem(KEY, JSON.stringify(q)); }
  catch { throw new Error(BEWAAR_FOUT); }
  window.dispatchEvent(new Event("notitie-wachtrij-veranderd"));
};

function beheerWeigering(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const fout = e as { code?: string; message?: string };
  return ["42501", "403", "PGRST301"].includes(fout.code ?? "") || /beheer|permission|row.level|jwt.*expired/i.test(fout.message ?? "");
}
const zelfdeVersie = (a: Bewaard | undefined, b: Bewaard) => !!a && (b.versie ? a.versie === b.versie : a.tekst === b.tekst);

async function bewaarOnline({ stationId, categorie, tekst }: Item) {
  const { data, error } = await supabase.rpc("categorienotitie_opslaan", {
    _station_id: stationId, _categorie: categorie, _tekst: tekst.trim(),
  });
  if (error || data !== true) throw error ?? { code: "42501", message: "Beheer vergrendeld of verlopen" };
}

/** Slaat op; offline of bij een fout gaat hij in de wachtrij. Geeft "online" | "wachtrij". */
export async function bewaarNotitie(item: Item): Promise<NotitieStatus> {
  const k = `${item.stationId}|${item.categorie}`;
  // Eerst duurzaam vastleggen: ook een herstart tijdens het verzoek mag geen tekst verliezen.
  const versie = crypto.randomUUID();
  const q = lees(); q[k] = { ...item, versie }; schrijf(q);
  if (navigator.onLine) await verstuurNotities();
  return lokaleNotitieStatus(item.stationId, item.categorie);
}

/** Durable reason survives reload; a network recovery does not fix an expired PIN. */
export function lokaleNotitieStatus(stationId: string, categorie: string): NotitieStatus {
  const item = lees()[`${stationId}|${categorie}`];
  return !item ? "online" : item.fout === "beheer" ? "beheer" : "wachtrij";
}

/** Lokale (nog niet verstuurde) notitie, zodat offline-tekst niet verdwijnt. */
export function lokaleNotitie(stationId: string, categorie: string): string | undefined {
  try { return lees()[`${stationId}|${categorie}`]?.tekst; } catch { return undefined; }
}

export function aantalLokaleNotities(stationId: string): number {
  return Object.values(lees()).filter(item => item.stationId === stationId).length;
}

let versturen: Promise<number> | undefined;
export function verstuurNotities(): Promise<number> {
  if (!navigator.onLine) return Promise.resolve(0);
  if (versturen) return versturen;
  versturen = flush().finally(() => { versturen = undefined; });
  return versturen;
}

/** Wait out a failing in-flight attempt, then retry with the newly granted session. No PIN prompt here. */
export async function verstuurNotitiesNaBeheer(): Promise<number> {
  if (versturen) await versturen;
  return verstuurNotities();
}

async function flush(): Promise<number> {
  let n = 0;
  const geprobeerd = new Set<string>();
  while (navigator.onLine) {
    const entry = Object.entries(lees()).find(([k, i]) => !geprobeerd.has(`${k}|${i.versie ?? i.tekst}`));
    if (!entry) break;
    const [k, item] = entry;
    geprobeerd.add(`${k}|${item.versie ?? item.tekst}`);
    try { await bewaarOnline(item); } catch (e) {
      const nu = lees();
      if (zelfdeVersie(nu[k], item)) { nu[k] = { ...item, fout: beheerWeigering(e) ? "beheer" : "verbinding" }; schrijf(nu); }
      continue; // Neither network nor authorization failures remove local text.
    }
    // Lees opnieuw na await: nooit een intussen getypte notitie of andere categorie wissen.
    const nu = lees();
    if (zelfdeVersie(nu[k], item)) { delete nu[k]; schrijf(nu); }
    n++;
  }
  return n;
}
