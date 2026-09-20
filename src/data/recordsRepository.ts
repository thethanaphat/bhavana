import { openDatabase } from './db';
import type { LegacyBaseline } from './models';

export async function getLegacyBaseline(): Promise<LegacyBaseline | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('legacyBaseline', 'readonly');
    const request = tx.objectStore('legacyBaseline').get('sitting');
    request.onsuccess = () => resolve((request.result as LegacyBaseline | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Unable to read legacy total'));
  });
}

export async function saveLegacyBaseline(hours: number, minutes: number, asOfDate: string, note: string): Promise<LegacyBaseline> {
  const parsedDate = new Date(`${asOfDate}T12:00:00`);
  const validDate = !Number.isNaN(parsedDate.getTime()) &&
    `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}` === asOfDate;
  if (!Number.isInteger(hours) || hours < 0 || hours > 99999 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !validDate || note.length > 200) {
    throw new Error('Invalid legacy total');
  }
  const db = await openDatabase();
  const baseline: LegacyBaseline = { id: 'sitting', sittingDurationSec: hours * 3600 + minutes * 60, asOfDate, note: note.trim() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('legacyBaseline', 'readwrite');
    tx.objectStore('legacyBaseline').put(baseline);
    tx.oncomplete = () => resolve(baseline);
    tx.onerror = () => reject(tx.error ?? new Error('Unable to save legacy total'));
    tx.onabort = () => reject(tx.error ?? new Error('Unable to save legacy total'));
  });
}

export async function deleteLegacyBaseline(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('legacyBaseline', 'readwrite');
    tx.objectStore('legacyBaseline').delete('sitting');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to delete legacy total'));
    tx.onabort = () => reject(tx.error ?? new Error('Unable to delete legacy total'));
  });
}
