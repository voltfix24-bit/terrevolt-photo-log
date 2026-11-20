import { supabase } from "@/integrations/supabase/client";
import { FOTO_BUCKET, type Db } from "@/lib/fotos-service";
import { internetVereist, INTERNET_NODIG } from "@/lib/internet";

/** Station verwijderen: rij eerst (fotos/notities/skips/TO-rondes cascaderen), daarna de bestanden. */
export async function verwijderStation(stationId: string, db: Db = supabase): Promise<{ ok: boolean; fout?: string; bestandenOver?: number }> {
  if (!internetVereist()) return { ok: false, fout: INTERNET_NODIG };
  const { data: fotos, error: lees } = await db.from("fotos").select("storage_path").eq("station_id", stationId);
  if (lees) return { ok: false, fout: lees.message };
  const { data: weg, error } = await db.from("stations").delete().eq("id", stationId).select("id");
  if (error) return { ok: false, fout: error.message };
  if (!weg || weg.length === 0) return { ok: false, fout: "Niet verwijderd (toegangscode nodig)" };
  const paden = (fotos ?? []).map((f: { storage_path: string }) => f.storage_path);
  if (paden.length) {
    const { error: rmErr } = await db.storage.from(FOTO_BUCKET).remove(paden);
    if (rmErr) { console.error("[station] bestanden niet verwijderd:", stationId, rmErr.message); return { ok: true, bestandenOver: paden.length }; }
  }
  return { ok: true };
}

/** Werkt alleen de Status-kolom in SharePoint bij; geeft terug of dat lukte. */
export async function sharepointStatusBijwerken(stationId: string, db: Db = supabase): Promise<boolean> {
  if (!internetVereist()) return false;
  try {
    const { data, error } = await db.functions.invoke("sharepoint-sync", { body: { station_id: stationId, alleen_status: true } });
    return !error && (data as { ok?: boolean })?.ok !== false;
  } catch { return false; }
}
