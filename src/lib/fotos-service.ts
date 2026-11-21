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

/**
 * Bestaande registratie van een wachtrij-item (q_{queueId}.*), ongeacht extensie. Een oud item zonder
 * vastgelegd pad kan eerder al als .png geregistreerd zijn; dan hergebruiken we dat pad.
 */
export async function geregistreerdWachtrijPad(stationId: string, categorie: string, queueId: string, db: Db = supabase): Promise<string | null> {
  const prefix = `stations/${stationId}/${catSlug(categorie)}/q_${veiligeNaam(queueId)}.`;
  const { data, error } = await db.from("fotos").select("storage_path").eq("station_id", stationId).like("storage_path", `${prefix}%`).limit(1);
  if (error) throw new Error(String(error.message ?? error));
  const p = Array.isArray(data) ? (data[0] as { storage_path?: string } | undefined)?.storage_path : undefined;
  return p && p.startsWith(prefix) ? p : null;
}

export type UploadResultaat = { ok: true; pad: string; url: string; al: boolean } | { ok: false; fout: string; stap: "opslag" | "registratie" };

type Registratie = { stationId: string; categorie: string; volgorde: number };

/**
 * Upload naar opslag en registreer in `fotos`. Idempotent per vast pad: bestaat het bestand of de
 * rij al, dan wordt niets dubbel gemaakt. Een mislukte of onzekere INSERT (verloren response, tweede
 * tab, unieke-padbotsing) wordt eerst opnieuw gelezen; het bestand wordt nooit verwijderd, omdat het
 * mogelijk al geregistreerd is. Een retry op hetzelfde pad convergeert naar één rij en één bestand.
 */
export async function uploadEnRegistreer(pad: string, blob: Blob, reg: Registratie, db: Db = supabase): Promise<UploadResultaat> {
  const opslag = db.storage.from(FOTO_BUCKET);
  const { error: upErr } = await opslag.upload(pad, blob);
  if (upErr) {
    const msg = String(upErr.message ?? upErr);
    if (!(/exist|duplicate|409/i.test(msg) || String(upErr.statusCode) === "409")) return { ok: false, fout: msg, stap: "opslag" };
  }
  const url = opslag.getPublicUrl(pad).data.publicUrl as string;
  const bestaat = async (): Promise<boolean | string> => {
    const { data, error } = await db.from("fotos").select("id").eq("storage_path", pad).limit(1);
    if (error) return String(error.message ?? error);
    return Array.isArray(data) && data.length > 0;
  };

  const voor = await bestaat();
  if (typeof voor === "string") return { ok: false, fout: voor, stap: "registratie" };
  if (voor) return { ok: true, pad, url, al: true };

  let insErr: { message?: string; code?: string } | null = null;
  try {
    ({ error: insErr } = await db.from("fotos").insert({
      station_id: reg.stationId, categorie: reg.categorie, storage_path: pad, url, volgorde: reg.volgorde, uploaded_at: new Date().toISOString(),
    }));
  } catch (e) { insErr = { message: (e as Error)?.message || "Registratie onzeker" }; }
  if (insErr) {
    // Onzekere uitkomst: mogelijk toch geregistreerd. Herlees; bij twijfel blijft het bestand staan.
    const na = await bestaat();
    if (na === true) return { ok: true, pad, url, al: true };
    return { ok: false, fout: String(insErr.message ?? insErr), stap: "registratie" };
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
