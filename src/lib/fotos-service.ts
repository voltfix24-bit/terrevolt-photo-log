import { supabase } from "@/integrations/supabase/client";
import { internetVereist, INTERNET_NODIG } from "@/lib/internet";

export const FOTO_BUCKET = "to-fotos";
// Minimale vorm van de client, zodat de service ook met een nep-client te testen is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

export const catSlug = (categorie: string) => categorie.toLowerCase().replace(/[^a-z0-9]/g, "_");
const veiligeNaam = (naam: string) => naam.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "foto";
const extVan = (b: Blob, naam: string) => (b.type === "image/png" ? "png" : b.type === "image/heic" || /\.heic$/i.test(naam) ? "heic" : "jpg");

/** Uniek pad voor een directe upload (voorkomt botsing bij identieke bestandsnamen). */
export function nieuwPad(stationId: string, categorie: string, bestandsnaam: string): string {
  const uniek = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `stations/${stationId}/${catSlug(categorie)}/${uniek}_${veiligeNaam(bestandsnaam)}`;
}

/** Stabiel pad per wachtrij-item: dezelfde retry schrijft altijd naar hetzelfde bestand. */
export function wachtrijPad(stationId: string, categorie: string, queueId: string, blob: Blob, naam: string): string {
  return `stations/${stationId}/${catSlug(categorie)}/q_${veiligeNaam(queueId)}.${extVan(blob, naam)}`;
}

export type UploadResultaat = { ok: true; pad: string; url: string; al: boolean } | { ok: false; fout: string; stap: "opslag" | "registratie" };

type Registratie = { stationId: string; categorie: string; volgorde: number };

/**
 * Upload naar opslag en registreer in `fotos`. Idempotent: bestaat het bestand of de rij al, dan
 * wordt niets dubbel gemaakt. Mislukt de registratie bij een nieuw bestand, dan wordt dat bestand
 * opgeruimd (alleen als wij het net hebben geplaatst), anders gelogd voor herstel.
 */
export async function uploadEnRegistreer(pad: string, blob: Blob, reg: Registratie, db: Db = supabase): Promise<UploadResultaat> {
  const opslag = db.storage.from(FOTO_BUCKET);
  let bestondAl = false;
  const { error: upErr } = await opslag.upload(pad, blob);
  if (upErr) {
    const msg = String(upErr.message ?? upErr);
    if (/exist|duplicate|409/i.test(msg) || String(upErr.statusCode) === "409") bestondAl = true;
    else return { ok: false, fout: msg, stap: "opslag" };
  }
  const url = opslag.getPublicUrl(pad).data.publicUrl as string;

  const { data: bestaand, error: zoekErr } = await db.from("fotos").select("id").eq("storage_path", pad).limit(1);
  if (zoekErr) return { ok: false, fout: zoekErr.message, stap: "registratie" };
  if (bestaand && bestaand.length > 0) return { ok: true, pad, url, al: true };

  const { error: insErr } = await db.from("fotos").insert({
    station_id: reg.stationId, categorie: reg.categorie, storage_path: pad, url, volgorde: reg.volgorde, uploaded_at: new Date().toISOString(),
  });
  if (insErr) {
    if (!bestondAl) {
      const { error: rmErr } = await opslag.remove([pad]);
      if (rmErr) console.error("[fotos] bestand zonder registratie, handmatig herstellen:", pad, rmErr.message);
    }
    return { ok: false, fout: insErr.message, stap: "registratie" };
  }
  return { ok: true, pad, url, al: false };
}

/** Volledige fotolijst van één station, alleen opgehaald als hij nodig is (pdf/zip). */
export async function fotosVan(stationId: string, db: Db = supabase): Promise<{ id: string; categorie: string; url: string; uploaded_at: string | null }[]> {
  const { data, error } = await db.from("fotos").select("id, categorie, url, uploaded_at").eq("station_id", stationId).order("categorie");
  if (error) throw error;
  return data ?? [];
}

/** Verwijdert eerst de rij (bron van waarheid), daarna het bestand. */
export async function verwijderFoto(fotoId: string, pad: string, db: Db = supabase): Promise<{ ok: boolean; fout?: string; bestandBlijft?: boolean }> {
  if (!internetVereist()) return { ok: false, fout: INTERNET_NODIG };
  const { data, error } = await db.from("fotos").delete().eq("id", fotoId).select("id");
  if (error) return { ok: false, fout: error.message };
  // Geen rij verwijderd = geen rechten (geen beheerderssessie) of al weg: geen succes melden
  if (!data || data.length === 0) return { ok: false, fout: "Niet verwijderd (toegangscode nodig)" };
  const { error: rmErr } = await db.storage.from(FOTO_BUCKET).remove([pad]);
  if (rmErr) { console.error("[fotos] bestand niet verwijderd, handmatig opruimen:", pad, rmErr.message); return { ok: true, bestandBlijft: true }; }
  return { ok: true };
}

/** Both example screens confirm the intended row before touching its storage file. */
export async function verwijderVoorbeeld(id: string, pad: string, db: Db = supabase): Promise<{ ok: boolean; bestandBlijft?: boolean }> {
  if (!internetVereist()) return { ok: false };
  const { data, error } = await db.from("categorie_voorbeelden").delete().eq("id", id).select("id");
  if (error || !Array.isArray(data) || !data.some((row: { id: string }) => row.id === id)) return { ok: false };
  const { error: opslag } = await db.storage.from(FOTO_BUCKET).remove([pad]);
  return opslag ? { ok: true, bestandBlijft: true } : { ok: true };
}
