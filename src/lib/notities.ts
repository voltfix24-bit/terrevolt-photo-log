// Notities (categorie_opmerkingen) opslaan met een eenvoudige offline-wachtrij in localStorage.
import { supabase } from "@/integrations/supabase/client";

const KEY = "notitie-wachtrij-v1";
type Item = { stationId: string; categorie: string; tekst: string };
const lees = (): Record<string, Item> => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const schrijf = (q: Record<string, Item>) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* */ } };

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
  if (navigator.onLine) {
    try { await bewaarOnline(item); const q = lees(); delete q[k]; schrijf(q); return "online"; } catch { /* naar wachtrij */ }
  }
  const q = lees(); q[k] = item; schrijf(q);
  return "wachtrij";
}

/** Lokale (nog niet verstuurde) notitie, zodat offline-tekst niet verdwijnt. */
export function lokaleNotitie(stationId: string, categorie: string): string | undefined {
  return lees()[`${stationId}|${categorie}`]?.tekst;
}

export async function verstuurNotities(): Promise<number> {
  const q = lees(); let n = 0;
  for (const [k, item] of Object.entries(q)) {
    try { await bewaarOnline(item); delete q[k]; n++; } catch { /* blijft staan */ }
  }
  schrijf(q);
  return n;
}
