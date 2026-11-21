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
  /** Tijdstip (ms) waarop storage+DB bevestigd zijn; het item blijft tot de serverlijst het pad toont. */
  klaarOp?: number;
};

interface OfflineDB extends DBSchema {
  'photo-queue': {
    key: string;
    value: QueueItem;
    indexes: { 'by-station': string; 'by-status': string; 'by-station-cat': [string, string] };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | undefined;

export const QUEUE_EVENT = 'foto-wachtrij-veranderd';
/** Een andere (oude) tab houdt de fotodatabase open; detail.geblokkeerd = true/false. */
export const OPSLAG_GEBLOKKEERD_EVENT = 'foto-opslag-geblokkeerd';
const changed = () => window.dispatchEvent(new Event(QUEUE_EVENT));
const blokkade = (geblokkeerd: boolean) => window.dispatchEvent(new CustomEvent(OPSLAG_GEBLOKKEERD_EVENT, { detail: { geblokkeerd } }));
export const LEASE_MS = 120_000;
export const DB_VERSIE = 2;

/**
 * Eén gedeelde open-promise. Houdt een oude tab de database open (blocked), dan wacht de upgrade
 * tot die tab sluit en meldt de UI dat; vraagt een nieuwere tab om een upgrade (blocking/versionchange),
 * dan sluiten we onze eigen verbinding zodat die kan doorgaan. Nooit wissen.
 */
export function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    const open = openDB<OfflineDB>('terrevolt-offline', DB_VERSIE, {
      upgrade(d, oldVersion, _new, tx) {
        const store = oldVersion < 1 ? d.createObjectStore('photo-queue', { keyPath: 'id' }) : tx.objectStore('photo-queue');
        if (oldVersion < 1) { store.createIndex('by-station', 'stationId'); store.createIndex('by-status', 'status'); }
        if (!store.indexNames.contains('by-station-cat')) store.createIndex('by-station-cat', ['stationId', 'categorie']);
      },
      blocked() { blokkade(true); },
      blocking() { void sluitDB(); },
      terminated() { dbPromise = undefined; },
    });
    dbPromise = open.then((d) => { blokkade(false); return d; }, (e) => { dbPromise = undefined; throw e; });
  }
  return dbPromise;
}

/** Sluit de eigen verbinding (bij versionchange); een volgende getDB opent opnieuw. */
export async function sluitDB() {
  const p = dbPromise; dbPromise = undefined;
  if (p) { try { (await p).close(); } catch { /* al dicht */ } }
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

/**
 * Atomaire, eigenaar-gecontroleerde finalisatie: alleen de huidige leasehouder mag afronden of een
 * fout vastleggen. Een late worker wiens lease verliep en door een ander is geclaimd, raakt niets.
 */
async function finaliseer(id: string, eigenaar: string | undefined, f: (i: QueueItem) => QueueItem): Promise<boolean> {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readwrite');
  const item = await tx.store.get(id);
  if (!item || (eigenaar !== undefined && item.leaseEigenaar !== eigenaar)) { await tx.done; return false; }
  await tx.store.put(f(item));
  await tx.done;
  changed();
  return true;
}

export const markDone = (id: string, eigenaar?: string) =>
  finaliseer(id, eigenaar, (item) => ({ ...item, status: 'done', klaarOp: Date.now(), leaseTot: undefined, leaseEigenaar: undefined }));

export const markError = (id: string, fout: string, soort: 'beheer' | 'overig' = 'overig', eigenaar?: string) =>
  finaliseer(id, eigenaar, (item) => ({ ...item, status: 'error', foutSoort: soort, pogingen: (item.pogingen ?? 0) + 1, laatsteFout: fout.slice(0, 300), leaseTot: undefined, leaseEigenaar: undefined }));

/** Zet een mislukt item terug naar 'bewaard', zodat dezelfde bevroren foto opnieuw wordt verstuurd. */
export async function opnieuwKlaarzetten(id: string) {
  const d = await getDB();
  const item = await d.get('photo-queue', id);
  if (item && item.status === 'error') { await d.put('photo-queue', { ...item, status: 'pending', foutSoort: undefined }); changed(); }
}

/** Bewaartermijn van verstuurde items die nooit door een zichtbare serverlijst zijn overgenomen. */
export const VERSTUURD_BEWAAR_MS = 24 * 60 * 60 * 1000;

/**
 * Verwijdert één verstuurd item pas na aantoonbare serverovername (zelfde pad in de serverlijst).
 * Atomair: alleen als het item nog 'done' is met precies dit pad.
 */
export async function verwijderVerstuurd(id: string, pad: string): Promise<boolean> {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readwrite');
  const item = await tx.store.get(id);
  if (!item || item.status !== 'done' || item.pad !== pad) { await tx.done; return false; }
  await tx.store.delete(id);
  await tx.done;
  changed();
  return true;
}

/** Opruimen na sync: alleen verstuurde items ouder dan de bewaartermijn (registratie was al bevestigd). */
export async function ruimVerstuurdOp(nu = Date.now(), bewaar = VERSTUURD_BEWAAR_MS) {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readwrite');
  let weg = 0;
  for (let c = await tx.store.index('by-status').openCursor('done'); c; c = await c.continue()) {
    const k = c.value.klaarOp;
    if (k == null || nu - k >= bewaar) { await c.delete(); weg++; }
  }
  await tx.done;
  if (weg) changed();
}

/** Verwijdert alle verstuurde items direct (alleen voor expliciete opruiming/tests). */
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

export type WachtrijSamenvatting = { totaal: number; open: number; bezig: number; fout: number; verstuurd: number };
/** Statusaantallen van één station via key-cursors en status-indexsleutels (geen blobs/value-cursors). */
export async function getWachtrijSamenvattingVoor(stationId: string): Promise<WachtrijSamenvatting> {
  const d = await getDB();
  const tx = d.transaction('photo-queue', 'readonly');
  const idx = tx.store.index('by-status');
  const [done, err, up] = await Promise.all([idx.getAllKeys('done'), idx.getAllKeys('error'), idx.getAllKeys('uploading')]);
  const sDone = new Set(done), sErr = new Set(err), sUp = new Set(up);
  const s: WachtrijSamenvatting = { totaal: 0, open: 0, bezig: 0, fout: 0, verstuurd: 0 };
  let cursor = await tx.store.index('by-station').openKeyCursor(IDBKeyRange.only(stationId));
  while (cursor) {
    const k = cursor.primaryKey;
    s.totaal++;
    if (sDone.has(k)) s.verstuurd++;
    else { s.open++; if (sErr.has(k)) s.fout++; else if (sUp.has(k)) s.bezig++; }
    cursor = await cursor.continue();
  }
  await tx.done;
  return s;
}
