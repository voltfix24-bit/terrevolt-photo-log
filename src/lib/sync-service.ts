import { getPendingPhotos, markDone, markError, clearDone, claimItem, bevries, type QueueItem } from './offline-queue';
import imageCompression from 'browser-image-compression';
import { uploadEnRegistreer, wachtrijPad, type Db } from './fotos-service';
import { supabase } from '@/integrations/supabase/client';

export type SyncResultaat = { gelukt: number; mislukt: number; fouten: string[] };

/** Absence is legitimate; an RLS-filtered zero-row delete is not proof of absence. */
export async function ophefSkipNaFoto(stationId: string, categorie: string, db: Db = supabase): Promise<void> {
  const { error } = await db.from('categorie_skips').delete().eq('station_id', stationId).eq('categorie', categorie);
  if (error) throw error;
  const check = await db.from('categorie_skips').select('id').eq('station_id', stationId).eq('categorie', categorie);
  if (check.error) throw check.error;
  if (!Array.isArray(check.data) || check.data.length > 0) throw new Error('N.v.t. niet opgeheven — controleer de beheerstatus; foto blijft lokaal bewaard');
}

export const isBeheerFout = (msg: string) => /row.level|permission|beheer|42501|pin nodig|not allowed|unauthori[sz]ed|403/i.test(msg);

/** Eenmalige voorbereiding: compressie naar JPEG; mislukt die, dan het origineel. Het resultaat wordt bevroren. */
export async function bereidFotoVoor(f: File): Promise<Blob> {
  if (f.type === 'image/heic' || /\.heic$/i.test(f.name)) return f;
  try { return await imageCompression(f, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg', initialQuality: 0.85 }); }
  catch { return f; }
}

type Item = Pick<QueueItem, 'id' | 'stationId' | 'categorie' | 'file' | 'fileName'> & Partial<QueueItem>;
export type SyncDeps = {
  pending: () => Promise<Item[]>;
  klaar: (id: string) => Promise<void>;
  fout: (id: string, msg: string, soort?: 'beheer' | 'overig') => Promise<void>;
  opruimen: () => Promise<void>;
  comprimeer: (f: File) => Promise<Blob>;
  upload: typeof uploadEnRegistreer;
  ophefSkip?: (stationId: string, categorie: string) => Promise<void>;
  /** Claimt het item exclusief (lease); null = een andere tab/worker is ermee bezig. */
  claim?: (id: string, eigenaar: string) => Promise<Item | null>;
  /** Legt blob+pad vast vóór transport; false = niet vastgelegd, dus niet versturen. */
  bevries?: (id: string, eigenaar: string, blob: Blob, pad: string) => Promise<boolean>;
};

const standaard: SyncDeps = {
  pending: getPendingPhotos, klaar: markDone, fout: markError, opruimen: clearDone,
  comprimeer: bereidFotoVoor, upload: uploadEnRegistreer, ophefSkip: ophefSkipNaFoto,
  claim: claimItem, bevries,
};

const eigenaar = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());
let isSyncing = false;
let nogEens = false;

/**
 * Verstuurt de wachtrij. Een item wordt pas klaar gemarkeerd na bevestigde opslag, registratie en
 * opgeheven N.v.t. Elk item heeft één bevroren blob en één vast pad, dus retries convergeren naar
 * één bestand en één rij. Achtergrondwerk vraagt nooit om de PIN: beheerweigeringen blijven staan
 * als 'beheer' en worden na "beheer-veranderd" opnieuw geprobeerd.
 */
export async function syncPendingPhotos(onProgress?: (done: number, total: number) => void, deps: SyncDeps = standaard): Promise<SyncResultaat> {
  const res: SyncResultaat = { gelukt: 0, mislukt: 0, fouten: [] };
  if (isSyncing) { nogEens = true; return res; }
  if (!navigator.onLine) return res;
  isSyncing = true;
  try {
    do {
      nogEens = false;
      const pending = await deps.pending();
      let n = 0;
      for (const kandidaat of pending) {
        if (!navigator.onLine) break; // niets verwijderen wanneer het netwerk onderweg wegvalt
        const item = deps.claim ? await deps.claim(kandidaat.id, eigenaar) : kandidaat;
        if (!item) continue;
        try {
          let blob: Blob = item.file; let pad = item.pad;
          if (!item.voorbereid || !pad) {
            blob = await deps.comprimeer(new File([item.file], item.fileName, { type: item.file.type }));
            pad = wachtrijPad(item.stationId, item.categorie, item.id, blob, item.fileName);
            if (deps.bevries && !await deps.bevries(item.id, eigenaar, blob, pad)) throw new Error('Foto kon niet worden vastgelegd op dit toestel');
          }
          const r = await deps.upload(pad, blob, { stationId: item.stationId, categorie: item.categorie, volgorde: 0 });
          if ("fout" in r) throw new Error(r.fout);
          await deps.ophefSkip?.(item.stationId, item.categorie);
          await deps.klaar(item.id);
          res.gelukt++;
        } catch (e) {
          const msg = (e as Error)?.message || 'Onbekende fout';
          res.mislukt++; res.fouten.push(`${item.fileName}: ${msg}`);
          await deps.fout(item.id, msg, isBeheerFout(msg) ? 'beheer' : 'overig').catch(() => {});
        }
        onProgress?.(res.gelukt + res.mislukt, pending.length);
        n++;
      }
      await deps.opruimen();
    } while (nogEens && navigator.onLine);
    return res;
  } finally {
    isSyncing = false;
  }
}
