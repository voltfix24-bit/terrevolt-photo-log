import { getPendingPhotos, markDone, markError, clearDone } from './offline-queue';
import imageCompression from 'browser-image-compression';
import { uploadEnRegistreer, wachtrijPad } from './fotos-service';

export type SyncResultaat = { gelukt: number; mislukt: number; fouten: string[] };

type Item = { id: string; stationId: string; categorie: string; file: Blob; fileName: string };
export type SyncDeps = {
  pending: () => Promise<Item[]>;
  klaar: (id: string) => Promise<void>;
  fout: (id: string, msg: string) => Promise<void>;
  opruimen: () => Promise<void>;
  comprimeer: (f: File) => Promise<Blob>;
  upload: typeof uploadEnRegistreer;
};

const standaard: SyncDeps = {
  pending: getPendingPhotos, klaar: markDone, fout: markError, opruimen: clearDone,
  comprimeer: async (f) => {
    if (f.type === 'image/heic' || /\.heic$/i.test(f.name)) return f;
    try { return await imageCompression(f, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg', initialQuality: 0.85 }); }
    catch { return f; }
  },
  upload: uploadEnRegistreer,
};

let isSyncing = false;

/**
 * Uploadt de wachtrij. Een item wordt pas lokaal verwijderd als opslag én registratie gelukt zijn;
 * bij een fout blijft het staan (status 'error') en wordt het bij de volgende sync opnieuw geprobeerd.
 * Het opslagpad is stabiel per item, dus een retry maakt geen dubbele foto.
 */
export async function syncPendingPhotos(onProgress?: (done: number, total: number) => void, deps: SyncDeps = standaard): Promise<SyncResultaat> {
  const res: SyncResultaat = { gelukt: 0, mislukt: 0, fouten: [] };
  if (isSyncing) return res;
  isSyncing = true;
  try {
    const pending = await deps.pending();
    for (const item of pending) {
      try {
        const blob = await deps.comprimeer(new File([item.file], item.fileName, { type: item.file.type }));
        const pad = wachtrijPad(item.stationId, item.categorie, item.id, blob, item.fileName);
        const r = await deps.upload(pad, blob, { stationId: item.stationId, categorie: item.categorie, volgorde: 0 });
        if ("fout" in r) throw new Error(r.fout);
        await deps.klaar(item.id);
        res.gelukt++;
      } catch (e) {
        const msg = (e as Error)?.message || 'Onbekende fout';
        res.mislukt++; res.fouten.push(`${item.fileName}: ${msg}`);
        await deps.fout(item.id, msg).catch(() => {});
      }
      onProgress?.(res.gelukt + res.mislukt, pending.length);
    }
    await deps.opruimen();
    return res;
  } finally {
    isSyncing = false;
  }
}
