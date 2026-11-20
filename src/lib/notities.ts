// Notities (categorie_opmerkingen) opslaan met een eenvoudige offline-wachtrij in localStorage.
import { supabase } from "@/integrations/supabase/client";

const KEY = "notitie-wachtrij-v1";
type Item = { stationId: string; categorie: string; tekst: string };
type Bewaard = Item & { versie?: string };
const BEWAAR_FOUT = "Notitie niet bewaard op dit apparaat. Houd dit venster open en probeer opnieuw; mogelijk is de opslag vol.";
const lees = (): Record<string, Bewaard> => {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
  catch { throw new Error(BEWAAR_FOUT); }
};
const schrijf = (q: Record<string, Bewaard>) => {
  try { localStorage.setItem(KEY, JSON.stringify(q)); }
  catch { throw new Error(BEWAAR_FOUT); }
};

async function bewaarOnline({ stationId, categorie, tekst }: Item) {
  const t = tekst.trim();
  const { error } = t
    ? await supabase.from("categorie_opmerkingen").upsert({ station_id: stationId, categorie, opmerking: t, updated_at: new Date().toISOString() }, { onConflict: "station_id,categorie" })
    : await supabase.from("categorie_opmerkingen").delete().eq("station_id", stationId).eq("categorie", categorie);
  if (error) throw error;
}

/** Slaat op; offline of bij een fout gaat hij in de wachtrij. Geeft "online" | "wachtrij". */
export async function bewaarNotitie(item: Item): Promise<"online" | "wachtrij"> {
  const k = `${item.stationId}|${item.categorie}`;
  // Eerst duurzaam vastleggen: ook een herstart tijdens het verzoek mag geen tekst verliezen.
  const versie = crypto.randomUUID();
  const q = lees(); q[k] = { ...item, versie }; schrijf(q);
  if (navigator.onLine) await verstuurNotities();
  return lees()[k] ? "wachtrij" : "online";
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

async function flush(): Promise<number> {
  let n = 0;
  const geprobeerd = new Set<string>();
  while (navigator.onLine) {
    const entry = Object.entries(lees()).find(([k, i]) => !geprobeerd.has(`${k}|${i.versie ?? i.tekst}`));
    if (!entry) break;
    const [k, item] = entry;
    geprobeerd.add(`${k}|${item.versie ?? item.tekst}`);
    try { await bewaarOnline(item); } catch { continue; } // netwerkfout: lokaal behouden
    // Lees opnieuw na await: nooit een intussen getypte notitie of andere categorie wissen.
    const nu = lees();
    if (JSON.stringify(nu[k]) === JSON.stringify(item)) { delete nu[k]; schrijf(nu); }
    n++;
  }
  return n;
}
