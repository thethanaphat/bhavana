import { buildBackup, type BackupFile } from './backup';
import { loadSettings, openDatabase } from './db';
import type { ChantSession, CustomPrayer, LegacyBaseline, PracticeSession } from './models';

const HISTORY_STORES = ['practiceSessions', 'chantSessions', 'legacyBaseline', 'activeSession'] as const;
const ALL_STORES = ['practiceSessions', 'chantSessions', 'customPrayers', 'legacyBaseline', 'settings', 'activeSession'] as const;

function readAll<T>(tx: IDBTransaction, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error(`Unable to read ${store}`));
  });
}

function settle(tx: IDBTransaction, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(message));
    tx.onabort = () => reject(tx.error ?? new Error(message));
  });
}

export async function collectBackup(nowIso: string): Promise<BackupFile> {
  const db = await openDatabase();
  const settings = await loadSettings();
  // อ่านทุก store ใน transaction เดียว เพื่อให้ได้ภาพ ณ เวลาเดียวกัน ไม่ใช่คนละจังหวะ
  const tx = db.transaction(['practiceSessions', 'chantSessions', 'customPrayers', 'legacyBaseline'], 'readonly');
  const [practiceSessions, chantSessions, customPrayers, baselines] = await Promise.all([
    readAll<PracticeSession>(tx, 'practiceSessions'),
    readAll<ChantSession>(tx, 'chantSessions'),
    readAll<CustomPrayer>(tx, 'customPrayers'),
    readAll<LegacyBaseline>(tx, 'legacyBaseline'),
  ]);
  return buildBackup({ settings, practiceSessions, chantSessions, customPrayers, legacyBaseline: baselines[0] ?? null }, nowIso);
}

// แทนที่ข้อมูลเดิมทั้งหมด ไม่ใช่รวมกัน เพราะการรวมจะทำให้ผู้ใช้เดาไม่ออกว่าผลลัพธ์จะเป็นอย่างไร
// หน้าจอจึงต้องบอกจำนวนที่จะถูกแทนที่และให้ยืนยันก่อนเรียกฟังก์ชันนี้
export async function restoreBackup(data: BackupFile): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(ALL_STORES as unknown as string[], 'readwrite');
  for (const store of ALL_STORES) tx.objectStore(store).clear();
  for (const session of data.practiceSessions) tx.objectStore('practiceSessions').put(session);
  for (const chant of data.chantSessions) tx.objectStore('chantSessions').put(chant);
  for (const prayer of data.customPrayers) tx.objectStore('customPrayers').put(prayer);
  if (data.legacyBaseline) tx.objectStore('legacyBaseline').put(data.legacyBaseline);
  tx.objectStore('settings').put(data.settings);
  return settle(tx, 'Unable to restore backup');
}

// ล้างเฉพาะประวัติ บทสวดส่วนตัวและการตั้งค่ายังอยู่ เพราะเป็นเนื้อหาที่ผู้ใช้สร้างไว้ ไม่ใช่สถิติ
export async function clearHistory(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(HISTORY_STORES as unknown as string[], 'readwrite');
  for (const store of HISTORY_STORES) tx.objectStore(store).clear();
  return settle(tx, 'Unable to clear history');
}
