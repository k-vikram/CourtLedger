import type { Match } from './domain';

const DB = 'court-ledger';
const STORE = 'state';
const KEY = 'matches';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadMatches(): Promise<Match[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMatches(matches: Match[]) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(matches, KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
