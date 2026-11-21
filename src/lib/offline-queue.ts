import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type QueueStatus = 'pending' | 'uploading' | 'done' | 'error';
export type QueueItem = {
  id: string;
  stationId: string;
  categorie: string;
  /** Bevroren, voorbereide foto (na eenmalige compressie). Oude items: het origineel. */
  file: Blob;
  fileName: string;
  timestamp: string;
  status: QueueStatus;
  pogingen?: number;
  laatsteFout?: string;
  /** 'beheer' = server weigerde zonder geldige beheergrant; herstel na ontgrendelen. */
  foutSoort?: 'beheer' | 'overig';
  /** Vast opslagpad, vastgelegd vóór de eerste netwerkpoging. */
  pad?: string;
  /** true zodra `file` de definitieve, voorbereide blob is. */
  voorbereid?: boolean;
  leaseTot?: number;
  leaseEigenaar?: string;
};

interface OfflineDB extends DBSchema {
  'photo-queue': {
    key: string;
    value: QueueItem;
    indexes: { 'by-station': string; 'by-status': string; 'by-station-cat': [string, string] };
  };
}

let db: IDBPDatabase<OfflineDB> | undefined;

export const QUEUE_EVENT = 'foto-wachtrij-veranderd';
const changed = () => window.dispatchEvent(new Event(QUEUE_EVENT));
export const LEASE_MS = 120_000;

export async function getDB() {
  if (!db) {
    db = await openDB<OfflineDB>('terrevolt-offline', 2, {
      upgrade(d, oldVersion, _new, tx) {
        const store = oldVersion < 1 ? d.createObjectStore('photo-queue', { keyPath: 'id' }) : tx.objectStore('photo-queue');
        if (oldVersion < 1) { store.createIndex('by-station', 'stationId'); store.createIndex('by-status', 'status'); }
        if (!store.indexNames.contains('by-station-cat')) store.createIndex('by-station-cat', ['stationId', 'categorie']);
      },
    });
  }
  return db;
}

/** Nieuwe, willekeurige queue-identiteit; twee gelijke bestandsnamen blijven verschillende keuzes. */
export function nieuweQueueId(stationId: string): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${stationId}-${r}`;
}

/**
 * Bewaart een foto duurzaam. Resolveert pas nadat de IndexedDB-transactie is voltooid;
 * een opslagfout (bijv. vol) wordt doorgegooid zodat de UI geen valse "bewaard" toont.
 */
export async function queuePhoto(
  stationId: string,
  categorie: string,
  file: Blob & { name?: string },
  voorbereid?: { id: string; pad: string; fileName?: string },
): Promise<string> {
  const d = await getDB();
  const id = voorbereid?.id ?? nieuweQueueId(stationId);
  const tx = d.transaction('photo-queue', 'readwrite');
  await tx.store.add({
    id, stationId, categorie, file,
    fileName: voorbereid?.fileName ?? file.name ?? 'foto.jpg',
    timestamp: new Date().toISOString(),
    status: 'pending',
    ...(voorbereid ? { pad: voorbereid.pad, voorbereid: true } : {}),
  });
  await tx.done;
  changed();
  return id;
}

export async function getPendingPhotos(stationId?: string) {
  const d = await getDB();
  if (stationId) return (await d.getAllFromIndex('photo-queue', 'by-station', stationId)).filter(p => p.status !== 'done');
  return (await d.getAll('photo-queue')).filter(p => p.status !== 'done');
}

/** Alleen de items (en blobs) van één categorie, voor previews in de wizard. */
export async function getCategorieItems(stationId: string, categorie: string): Promise<QueueItem[]> {
  const d = await getDB();
  return d.getAllFromIndex('photo-queue', 'by-station-cat', [stationId, categorie]);
}

/** Atomaire claim (IndexedDB serialiseert readwrite-transacties ook tussen tabs). */
export async function claimItem(id: string, eigenaar: string, nu = Date.now()): Promise<QueueItem | null> {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readwrite');
  const item = await tx.store.get(id);
  if (!item || item.status === 'done' || (item.status === 'uploading' && item.leaseEigenaar !== eigenaar && (item.leaseTot ?? 0) > nu)) { await tx.done; return null; }
  const geclaimd: QueueItem = { ...item, status: 'uploading', leaseTot: nu + LEASE_MS, leaseEigenaar: eigenaar };
  await tx.store.put(geclaimd);
  await tx.done;
  changed();
  return geclaimd;
}

/** Legt de voorbereide blob en het pad vast vóór de eerste netwerkpoging (alleen door de claimhouder). */
export async function bevries(id: string, eigenaar: string, blob: Blob, pad: string): Promise<boolean> {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readwrite');
  const item = await tx.store.get(id);
  if (!item || item.leaseEigenaar !== eigenaar) { await tx.done; return false; }
  if (item.voorbereid && item.pad) { await tx.done; return item.pad === pad; }
  await tx.store.put({ ...item, file: blob, pad, voorbereid: true });
  await tx.done;
  return true;
}

export async function markDone(id: string) {
  const d = await getDB();
  const item = await d.get('photo-queue', id);
  if (item) { await d.put('photo-queue', { ...item, status: 'done', leaseTot: undefined, leaseEigenaar: undefined }); changed(); }
}

export async function markError(id: string, fout: string, soort: 'beheer' | 'overig' = 'overig') {
  const d = await getDB();
  const item = await d.get('photo-queue', id);
  if (item) await d.put('photo-queue', { ...item, status: 'error', foutSoort: soort, pogingen: (item.pogingen ?? 0) + 1, laatsteFout: fout.slice(0, 300), leaseTot: undefined, leaseEigenaar: undefined });
  changed();
}

/** Zet een mislukt item terug naar 'bewaard', zodat dezelfde bevroren foto opnieuw wordt verstuurd. */
export async function opnieuwKlaarzetten(id: string) {
  const d = await getDB();
  const item = await d.get('photo-queue', id);
  if (item && item.status === 'error') { await d.put('photo-queue', { ...item, status: 'pending', foutSoort: undefined }); changed(); }
}

export async function clearDone() {
  const d = await getDB();
  const keys = await d.getAllKeysFromIndex('photo-queue', 'by-status', 'done');
  for (const key of keys) await d.delete('photo-queue', key);
  if (keys.length) changed();
}

export async function getQueueCount(): Promise<number> {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readonly');
  const [total, done] = await Promise.all([tx.store.count(), tx.store.index('by-status').count('done')]);
  await tx.done;
  return total - done;
}

/** Key cursors expose only station and primary key, never deserialize a photo Blob. */
export async function getQueueCounts(): Promise<Record<string, number>> {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readonly');
  const done = new Set(await tx.store.index('by-status').getAllKeys('done'));
  const counts: Record<string, number> = {};
  let cursor = await tx.store.index('by-station').openKeyCursor();
  while (cursor) {
    if (!done.has(cursor.primaryKey)) counts[cursor.key] = (counts[cursor.key] ?? 0) + 1;
    cursor = await cursor.continue();
  }
  await tx.done;
  return counts;
}

/** Aantal niet-verstuurde foto's van één station, via key-cursors (geen blobs). */
export async function getQueueCountVoor(stationId: string): Promise<number> {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readonly');
  const done = new Set(await tx.store.index('by-status').getAllKeys('done'));
  let n = 0;
  let cursor = await tx.store.index('by-station').openKeyCursor(IDBKeyRange.only(stationId));
  while (cursor) { if (!done.has(cursor.primaryKey)) n++; cursor = await cursor.continue(); }
  await tx.done;
  return n;
}
