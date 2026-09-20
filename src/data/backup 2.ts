import { defaultSettings, type BackgroundSoundId, type BellInterval, type ChantSession, type CustomPrayer, type LegacyBaseline, type PracticeSession, type PracticeType, type Settings } from './models.js';

export const BACKUP_FORMAT = 'bhavana-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: string;
  version: number;
  exportedAt: string;
  settings: Settings;
  practiceSessions: PracticeSession[];
  chantSessions: ChantSession[];
  customPrayers: CustomPrayer[];
  legacyBaseline: LegacyBaseline | null;
}

export interface BackupCounts {
  practiceSessions: number;
  chantSessions: number;
  customPrayers: number;
  hasLegacyBaseline: boolean;
}

export type BackupCheck =
  | { ok: true; data: BackupFile; counts: BackupCounts }
  | { ok: false; errors: string[] };

// ตัวช่วยตรวจชนิดข้อมูล เขียนเองแทนการใช้ไลบรารี เพราะ schema มีไม่กี่ชนิด
// และไม่อยากเพิ่ม dependency ให้แอปที่ทั้งก้อนเป็น static
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

const practiceTypes: PracticeType[] = ['sitting', 'walking'];
const bellIntervals: BellInterval[] = [0, 1, 5, 10, 15];
const soundIds: BackgroundSoundId[] = ['rain', 'soft-tones'];

function checkPracticeSession(value: unknown, where: string, errors: string[]): value is PracticeSession {
  if (!isRecord(value)) { errors.push(`${where}: ไม่ใช่ข้อมูลที่อ่านได้`); return false; }
  const problems: string[] = [];
  if (typeof value.id !== 'string' || !value.id) problems.push('id');
  if (!practiceTypes.includes(value.type as PracticeType)) problems.push('type');
  if (!isIsoDate(value.startedAt)) problems.push('startedAt');
  if (!isIsoDate(value.endedAt)) problems.push('endedAt');
  if (!isCount(value.durationSec)) problems.push('durationSec');
  if (value.plannedDurationSec !== null && !isCount(value.plannedDurationSec)) problems.push('plannedDurationSec');
  if (value.status !== 'completed' && value.status !== 'stopped') problems.push('status');
  if (!bellIntervals.includes(value.bellIntervalMin as BellInterval)) problems.push('bellIntervalMin');
  if (value.backgroundSoundId !== null && !soundIds.includes(value.backgroundSoundId as BackgroundSoundId)) problems.push('backgroundSoundId');
  if (problems.length) errors.push(`${where}: ฟิลด์ไม่ถูกต้อง (${problems.join(', ')})`);
  return problems.length === 0;
}

function checkChantSession(value: unknown, where: string, errors: string[]): value is ChantSession {
  if (!isRecord(value)) { errors.push(`${where}: ไม่ใช่ข้อมูลที่อ่านได้`); return false; }
  const problems: string[] = [];
  if (typeof value.id !== 'string' || !value.id) problems.push('id');
  if (typeof value.prayerId !== 'string' || !value.prayerId) problems.push('prayerId');
  if (typeof value.prayerTitleSnapshot !== 'string') problems.push('prayerTitleSnapshot');
  if (value.rounds !== null && !isCount(value.rounds)) problems.push('rounds');
  if (!isIsoDate(value.startedAt)) problems.push('startedAt');
  if (!isIsoDate(value.endedAt)) problems.push('endedAt');
  if (value.durationSec !== null && !isCount(value.durationSec)) problems.push('durationSec');
  if (problems.length) errors.push(`${where}: ฟิลด์ไม่ถูกต้อง (${problems.join(', ')})`);
  return problems.length === 0;
}

function checkCustomPrayer(value: unknown, where: string, errors: string[]): value is CustomPrayer {
  if (!isRecord(value)) { errors.push(`${where}: ไม่ใช่ข้อมูลที่อ่านได้`); return false; }
  const problems: string[] = [];
  if (typeof value.id !== 'string' || !value.id) problems.push('id');
  if (typeof value.title !== 'string' || !value.title.trim()) problems.push('title');
  if (typeof value.text !== 'string') problems.push('text');
  if (!isIsoDate(value.createdAt)) problems.push('createdAt');
  if (!isIsoDate(value.updatedAt)) problems.push('updatedAt');
  if (problems.length) errors.push(`${where}: ฟิลด์ไม่ถูกต้อง (${problems.join(', ')})`);
  return problems.length === 0;
}

function checkLegacyBaseline(value: unknown, errors: string[]): LegacyBaseline | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || value.id !== 'sitting' || !isCount(value.sittingDurationSec) || typeof value.asOfDate !== 'string') {
    errors.push('ยอดสะสมเดิม: ฟิลด์ไม่ถูกต้อง');
    return null;
  }
  return { id: 'sitting', sittingDurationSec: value.sittingDurationSec, asOfDate: value.asOfDate, note: typeof value.note === 'string' ? value.note : '' };
}

// การตั้งค่าที่ผิดรูปไม่ควรทำให้ทั้งไฟล์ใช้ไม่ได้ เพราะมันสร้างใหม่ได้ง่าย
// ต่างจากประวัติการฝึกที่หายแล้วหายเลย จึงถอยไปใช้ค่าเริ่มต้นแทนการปฏิเสธไฟล์
function readSettings(value: unknown): Settings {
  const defaults = defaultSettings();
  if (!isRecord(value)) return defaults;
  const preference = (raw: unknown, fallback: Settings['sitting']): Settings['sitting'] => {
    if (!isRecord(raw)) return fallback;
    return {
      durationMin: raw.durationMin === null || isCount(raw.durationMin) ? (raw.durationMin as number | null) : fallback.durationMin,
      customMinutes: isCount(raw.customMinutes) ? raw.customMinutes : fallback.customMinutes,
      bellIntervalMin: bellIntervals.includes(raw.bellIntervalMin as BellInterval) ? raw.bellIntervalMin as BellInterval : fallback.bellIntervalMin,
      backgroundSoundId: soundIds.includes(raw.backgroundSoundId as BackgroundSoundId) ? raw.backgroundSoundId as BackgroundSoundId : null,
    };
  };
  return {
    id: 'main',
    sitting: preference(value.sitting, defaults.sitting),
    walking: preference(value.walking, defaults.walking),
    textScale: typeof value.textScale === 'number' && value.textScale >= 0.9 && value.textScale <= 1.4 ? value.textScale : defaults.textScale,
    theme: value.theme === 'light' || value.theme === 'dark' || value.theme === 'system' ? value.theme : defaults.theme,
  };
}

export function buildBackup(parts: Omit<BackupFile, 'format' | 'version' | 'exportedAt'>, nowIso: string): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: nowIso, ...parts };
}

export function readBackup(raw: unknown): BackupCheck {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['ไฟล์นี้ไม่ใช่ข้อมูลสำรองของภาวนา'] };
  if (raw.format !== BACKUP_FORMAT) return { ok: false, errors: ['ไฟล์นี้ไม่ใช่ข้อมูลสำรองของภาวนา'] };
  if (raw.version !== BACKUP_VERSION) {
    return { ok: false, errors: [`ไฟล์สำรองเป็นเวอร์ชัน ${String(raw.version)} แต่แอปรองรับเวอร์ชัน ${BACKUP_VERSION}`] };
  }

  const list = (value: unknown, name: string): unknown[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) { errors.push(`${name}: ต้องเป็นรายการ`); return []; }
    return value;
  };

  const practiceSessions = list(raw.practiceSessions, 'บันทึกการฝึก')
    .filter((item, index) => checkPracticeSession(item, `บันทึกการฝึกลำดับที่ ${index + 1}`, errors)) as PracticeSession[];
  const chantSessions = list(raw.chantSessions, 'บันทึกการสวด')
    .filter((item, index) => checkChantSession(item, `บันทึกการสวดลำดับที่ ${index + 1}`, errors)) as ChantSession[];
  const customPrayers = list(raw.customPrayers, 'บทสวดส่วนตัว')
    .filter((item, index) => checkCustomPrayer(item, `บทสวดส่วนตัวลำดับที่ ${index + 1}`, errors)) as CustomPrayer[];
  const legacyBaseline = checkLegacyBaseline(raw.legacyBaseline, errors);

  // ปฏิเสธทั้งไฟล์เมื่อมีแถวเสีย ไม่นำเข้าบางส่วนเงียบ ๆ เพราะผู้ใช้จะไม่มีทางรู้ว่าอะไรหายไป
  if (errors.length) return { ok: false, errors: errors.slice(0, 5) };

  const data = buildBackup(
    { settings: readSettings(raw.settings), practiceSessions, chantSessions, customPrayers, legacyBaseline },
    isIsoDate(raw.exportedAt) ? raw.exportedAt : new Date().toISOString(),
  );
  return {
    ok: true,
    data,
    counts: {
      practiceSessions: practiceSessions.length,
      chantSessions: chantSessions.length,
      customPrayers: customPrayers.length,
      hasLegacyBaseline: legacyBaseline !== null,
    },
  };
}

export function backupFileName(nowIso: string): string {
  return `bhavana-${nowIso.slice(0, 10)}.json`;
}
