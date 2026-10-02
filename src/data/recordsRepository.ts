import { openDatabase } from './db';
import type { LegacyBaseline } from './models';

// เลิกมีหน้าจอให้กรอกยอดยกมาแล้ว เพราะเติมย้อนหลังรายวันได้แทน
// แต่ยังอ่านไว้ เพื่อให้ยอดจากไฟล์สำรองเก่าที่นำเข้ายังนับในสถิติ ไม่หายเงียบ ๆ
export async function getLegacyBaseline(): Promise<LegacyBaseline | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('legacyBaseline', 'readonly');
    const request = tx.objectStore('legacyBaseline').get('sitting');
    request.onsuccess = () => resolve((request.result as LegacyBaseline | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Unable to read legacy total'));
  });
}
