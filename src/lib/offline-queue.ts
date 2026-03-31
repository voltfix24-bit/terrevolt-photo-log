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
    };
    indexes: { 'by-station': string; 'by-status': string };
  };
}

let db: IDBPDatabase<OfflineDB>;

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
  return id;
}

export async function getPendingPhotos(stationId?: string) {
  const db = await getDB();
  if (stationId) {
    return (await db.getAllFromIndex('photo-queue', 'by-station', stationId))
      .filter(p => p.status === 'pending');
  }
  return db.getAllFromIndex('photo-queue', 'by-status', 'pending');
}

export async function markDone(id: string) {
  const db = await getDB();
  const item = await db.get('photo-queue', id);
  if (item) {
    await db.put('photo-queue', { ...item, status: 'done' });
  }
}

export async function clearDone() {
  const db = await getDB();
  const all = await db.getAll('photo-queue');
  for (const item of all) {
    if (item.status === 'done') await db.delete('photo-queue', item.id);
  }
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  const pending = await db.getAllFromIndex('photo-queue', 'by-status', 'pending');
  return pending.length;
}
