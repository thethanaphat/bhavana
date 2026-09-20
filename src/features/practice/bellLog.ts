export type BellKind = 'start' | 'interval' | 'end' | 'keepalive';
export type BellOutcome = 'rang' | 'skipped-late' | 'failed' | 'interrupted' | 'recovered';

export interface BellLogEntry {
  id: string;
  sessionId: string;
  kind: BellKind;
  index: number | null;
  atIso: string;
  latenessMs: number;
  outcome: BellOutcome;
  reason?: string;
  // หัวอ่านเดินหน้าไปกี่มิลลิวินาทีหลังสั่งเล่น ถ้าไม่ขยับแปลว่าไม่มีเสียงออกจริง
  // play() ที่ resolve สำเร็จไม่ได้แปลว่าได้ยิน iOS อาจรับคำสั่งไว้แล้วไม่ส่งเสียงออกลำโพง
  playedMs?: number;
  state?: string;
}

const STORAGE_KEY = 'mindful-practice.bell-log';
const MAX_ENTRIES = 60;
export const PENDING = 'unknown';

// เก็บใน localStorage ไม่ใช่ IndexedDB เพื่อเลี่ยง schema migration ของฐานข้อมูลจริง
// ตัวนี้เป็นบันทึกไว้ไล่ปัญหาเท่านั้น หายไปก็ไม่กระทบข้อมูลการฝึก
function read(): BellLogEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as BellLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendBellLog(entry: Omit<BellLogEntry, 'id'>): string {
  const id = `${entry.sessionId}-${entry.kind}-${entry.index ?? 0}-${entry.atIso}`;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...read(), { ...entry, id }].slice(-MAX_ENTRIES)));
  } catch { /* โหมดส่วนตัวหรือพื้นที่เต็ม — ไม่ให้กระทบการฝึก */ }
  return id;
}

// ผลการวัดว่ามีเสียงออกจริงมาทีหลังการสั่งเล่นราววินาทีครึ่ง จึงต้องกลับมาเติมทีหลัง
export function patchBellLog(id: string, patch: Partial<BellLogEntry>): void {
  try {
    const entries = read();
    if (!entries.some((entry) => entry.id === id)) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(
      entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    ));
  } catch { /* ไม่ให้กระทบการฝึก */ }
}

// ระฆังเริ่มต้องเล่นในจังหวะที่ผู้ใช้แตะ ซึ่งเกิดก่อน session จะถูกสร้างและมี id
// จึงบันทึกไว้เป็น 'unknown' ก่อน แล้วมาเปลี่ยนชื่อเจ้าของทีหลังเมื่อรู้ id จริง
export function adoptPendingBellLog(sessionId: string): void {
  try {
    const entries = read();
    if (!entries.some((entry) => entry.sessionId === PENDING)) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(
      entries.map((entry) => (entry.sessionId === PENDING ? { ...entry, sessionId } : entry)),
    ));
  } catch { /* เก็บบันทึกไม่ได้ก็ไม่ให้กระทบการฝึก */ }
}

export function bellLogForSession(sessionId: string): BellLogEntry[] {
  return read().filter((entry) => entry.sessionId === sessionId);
}

const outcomeLabel: Record<BellOutcome, string> = {
  rang: 'ดัง',
  'skipped-late': 'ข้าม เพราะมาช้าเกินกำหนด',
  failed: 'เล่นไม่ได้',
  interrupted: 'ถูกขัดจังหวะ',
  recovered: 'กลับมาเล่นต่อได้',
};

const kindLabel: Record<BellKind, string> = { start: 'เริ่ม', interval: 'ระหว่างฝึก', end: 'จบ', keepalive: 'เสียงค้ำ' };

export function formatBellLog(entries: BellLogEntry[]): string[] {
  return entries.map((entry) => {
    const name = entry.kind === 'interval' && entry.index !== null ? `${kindLabel.interval} #${entry.index}` : kindLabel[entry.kind];
    const late = entry.latenessMs > 0 ? ` · ช้า ${(entry.latenessMs / 1000).toFixed(1)} วินาที` : '';
    const reason = entry.reason ? ` (${entry.reason})` : '';
    const sound = entry.outcome !== 'rang' ? ''
      : entry.playedMs === undefined ? ' · ยังไม่ได้วัด'
      : entry.playedMs >= 300 ? ` · เล่นจริง ${(entry.playedMs / 1000).toFixed(1)} วินาที`
      : ` · ⚠️ ไม่มีเสียงออก (หยุดที่ ${(entry.playedMs / 1000).toFixed(1)} วินาที · ${entry.state ?? '-'})`;
    return `${name} — ${outcomeLabel[entry.outcome]}${late}${reason}${sound}`;
  });
}
