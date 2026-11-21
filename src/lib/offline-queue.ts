import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface OfflineDB extends DBSchema {
  'photo-queue': {
    key: string;
    value: {
      id: string;
      stationId: string;
      categorie: string;
      file: Blob;
      fileName: string;
      timestamp: string;
      status: 'pending' | 'uploading' | 'done' | 'error';
      pogingen?: number;
      laatsteFout?: string;
    };
    indexes: { 'by-station': string; 'by-status': string };
  };
}

let db: IDBPDatabase<OfflineDB>;

export const QUEUE_EVENT = 'foto-wachtrij-veranderd';
const changed = () => window.dispatchEvent(new Event(QUEUE_EVENT));

export async function getDB() {
  if (!db) {
    db = await openDB<OfflineDB>('terrevolt-offline', 1, {
      upgrade(db) {
        const store = db.createObjectStore('photo-queue', { keyPath: 'id' });
        store.createIndex('by-station', 'stationId');
        store.createIndex('by-status', 'status');
      }
    });
  }
  return db;
}

export async function queuePhoto(
  stationId: string,
  categorie: string,
  file: File
): Promise<string> {
  const db = await getDB();
  const id = `${stationId}-${categorie}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await db.put('photo-queue', {
    id,
    stationId,
    categorie,
    file,
    fileName: file.name,
    timestamp: new Date().toISOString(),
    status: 'pending'
  });
  changed();
  return id;
}

export async function getPendingPhotos(stationId?: string) {
  const db = await getDB();
  if (stationId) {
    return (await db.getAllFromIndex('photo-queue', 'by-station', stationId))
      .filter(p => p.status !== 'done');
  }
  // Ook items met een eerdere fout opnieuw proberen
  return (await db.getAll('photo-queue')).filter(p => p.status !== 'done');
}

export async function markDone(id: string) {
  const db = await getDB();
  const item = await db.get('photo-queue', id);
  if (item) {
    await db.put('photo-queue', { ...item, status: 'done' });
    changed();
  }
}

export async function markError(id: string, fout: string) {
  const db = await getDB();
  const item = await db.get('photo-queue', id);
  if (item) await db.put('photo-queue', { ...item, status: 'error', pogingen: (item.pogingen ?? 0) + 1, laatsteFout: fout.slice(0, 300) });
  changed();
}

export async function clearDone() {
  const db = await getDB();
  const keys = await db.getAllKeysFromIndex('photo-queue', 'by-status', 'done');
  for (const key of keys) await db.delete('photo-queue', key);
  changed();
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('photo-queue', 'readonly');
  const [total, done] = await Promise.all([tx.store.count(), tx.store.index('by-status').count('done')]);
  await tx.done;
  return total - done;
}

/** Key cursors expose only station and primary key, never deserialize a photo Blob. */
export async function getQueueCounts(): Promise<Record<string, number>> {
  const db = await getDB();
  const tx = db.transaction('photo-queue', 'readonly');
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
