import { newId } from './id';
import { openDatabase } from './db';
import type { ChantSession, CustomPrayer } from './models';

export async function listCustomPrayers(): Promise<CustomPrayer[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customPrayers', 'readonly');
    const request = tx.objectStore('customPrayers').getAll();
    request.onsuccess = () => resolve((request.result as CustomPrayer[]).sort((a, b) => a.title.localeCompare(b.title, 'th')));
    request.onerror = () => reject(request.error ?? new Error('Unable to read custom prayers'));
  });
}

export async function saveCustomPrayer(title: string, text: string, id?: string): Promise<CustomPrayer> {
  const cleanTitle = title.trim();
  const cleanText = text.trim();
  if (!cleanTitle || !cleanText || cleanTitle.length > 100 || cleanText.length > 30000) {
    throw new Error('Invalid prayer title or text');
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customPrayers', 'readwrite');
    const store = tx.objectStore('customPrayers');
    const now = new Date().toISOString();
    let saved: CustomPrayer;
    const request = id ? store.get(id) : null;
    const persist = (existing?: CustomPrayer) => {
      if (id && !existing) { tx.abort(); return; }
      saved = { id: id ?? newId(), title: cleanTitle, text: cleanText, createdAt: existing?.createdAt ?? now, updatedAt: now };
      store.put(saved);
    };
    if (request) request.onsuccess = () => persist(request.result as CustomPrayer | undefined);
    else persist();
    tx.oncomplete = () => resolve(saved);
    tx.onerror = () => reject(tx.error ?? new Error('Unable to save custom prayer'));
    tx.onabort = () => reject(tx.error ?? new Error('Custom prayer no longer exists'));
  });
}

export async function deleteCustomPrayer(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customPrayers', 'readwrite');
    tx.objectStore('customPrayers').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to delete custom prayer'));
    tx.onabort = () => reject(tx.error ?? new Error('Unable to delete custom prayer'));
  });
}

export async function listChantSessions(): Promise<ChantSession[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chantSessions', 'readonly');
    const request = tx.objectStore('chantSessions').getAll();
    request.onsuccess = () => resolve((request.result as ChantSession[]).sort((a, b) => b.endedAt.localeCompare(a.endedAt)));
    request.onerror = () => reject(request.error ?? new Error('Unable to read chant sessions'));
  });
}

export async function addChantSession(prayerId: string, prayerTitleSnapshot: string, rounds: number | null, durationMin: number | null): Promise<ChantSession> {
  if (rounds !== null && (!Number.isInteger(rounds) || rounds < 1 || rounds > 9999)) throw new Error('Invalid rounds');
  if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 720)) throw new Error('Invalid duration');
  const db = await openDatabase();
  const endedMs = Date.now();
  const durationSec = durationMin === null ? null : durationMin * 60;
  const item: ChantSession = {
    id: newId(), prayerId, prayerTitleSnapshot,
    rounds, startedAt: new Date(endedMs - (durationSec ?? 0) * 1000).toISOString(),
    endedAt: new Date(endedMs).toISOString(), durationSec,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chantSessions', 'readwrite');
    tx.objectStore('chantSessions').put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error ?? new Error('Unable to save chanting'));
    tx.onabort = () => reject(tx.error ?? new Error('Unable to save chanting'));
  });
}
