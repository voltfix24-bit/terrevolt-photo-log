import { supabase } from "@/integrations/supabase/client";

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

/** Verwijdert eerst de rij (bron van waarheid), daarna het bestand. */
export async function verwijderFoto(fotoId: string, pad: string, db: Db = supabase): Promise<{ ok: boolean; fout?: string; bestandBlijft?: boolean }> {
  const { error } = await db.from("fotos").delete().eq("id", fotoId);
  if (error) return { ok: false, fout: error.message };
  const { error: rmErr } = await db.storage.from(FOTO_BUCKET).remove([pad]);
  if (rmErr) { console.error("[fotos] bestand niet verwijderd, handmatig opruimen:", pad, rmErr.message); return { ok: true, bestandBlijft: true }; }
  return { ok: true };
}
