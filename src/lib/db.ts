/** IndexedDB minimal : une table d'enregistrements versionnés + un petit stockage clé/valeur local. */
import type { Rec } from './types';

const DB_NAME = 'club74';
const DB_VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Migrations additives uniquement : on ne supprime jamais de données.
      if (!db.objectStoreNames.contains('records')) {
        const s = db.createObjectStore('records', { keyPath: ['col', 'id'] });
        s.createIndex('dirty', 'dirty');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function allRecords(): Promise<Rec[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('records').objectStore('records').getAll();
    req.onsuccess = () => resolve(req.result as Rec[]);
    req.onerror = () => reject(req.error);
  });
}

export async function putRecords(recs: Rec[]): Promise<void> {
  if (!recs.length) return;
  const db = await open();
  const tx = db.transaction('records', 'readwrite');
  const s = tx.objectStore('records');
  for (const r of recs) s.put(r);
  await done(tx);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction('kv', 'readwrite');
  if (value === undefined) tx.objectStore('kv').delete(key);
  else tx.objectStore('kv').put(value, key);
  await done(tx);
}

/** Demande au navigateur de ne pas purger les données (Safari peut sinon les effacer après inactivité). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
