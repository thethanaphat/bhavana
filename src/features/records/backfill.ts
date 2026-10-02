import type { ChantSession, PracticeSession, PracticeType } from '../../data/models';

export type BackfillKind = PracticeType | 'chanting';

// ข้อความผิดพลาดเป็นภาษาไทยเพราะแสดงบนฟอร์มตรง ๆ
export class BackfillError extends Error {}

// แปลง "2026-10-01" + "06:30" เป็นเวลาตาม timezone ของเครื่อง
// ตรวจกลับว่าวันที่ไม่ถูกเลื่อน เช่น 31 ก.พ. ที่ Date จะปัดไปเป็นต้นเดือนถัดไปเงียบ ๆ
export function localDateTimeMs(date: string, time: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const value = new Date(year, month - 1, day, hour, minute);
  if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) return null;
  return value.getTime();
}

function checkDuration(durationMin: number | null, required: boolean): void {
  if (durationMin === null) {
    if (required) throw new BackfillError('กรุณาใส่เวลาที่ฝึกเป็นนาที');
    return;
  }
  if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 720) {
    throw new BackfillError('เวลาที่ฝึกต้องเป็นจำนวนเต็ม 1–720 นาที');
  }
}

// เผื่อ 1 นาทีให้กรณีกรอกเวลาปัจจุบันพอดี นาฬิกาจะเดินไปหลายวินาทีกว่าจะกดบันทึก
const FUTURE_TOLERANCE_MS = 60_000;

function checkStart(date: string, time: string, endMs: (startMs: number) => number, nowMs: number): number {
  const startMs = localDateTimeMs(date, time);
  if (startMs === null) throw new BackfillError('วันที่หรือเวลาไม่ถูกต้อง');
  if (endMs(startMs) > nowMs + FUTURE_TOLERANCE_MS) throw new BackfillError('เวลาจบเลยเวลาปัจจุบัน บันทึกย้อนหลังได้เฉพาะสิ่งที่ทำไปแล้ว');
  return startMs;
}

export function buildManualPractice(
  id: string, type: PracticeType, date: string, time: string, durationMin: number | null, nowMs: number,
): PracticeSession {
  checkDuration(durationMin, true);
  const durationMs = durationMin! * 60_000;
  const startMs = checkStart(date, time, (start) => start + durationMs, nowMs);
  const startedAt = new Date(startMs).toISOString();
  const endedAt = new Date(startMs + durationMs).toISOString();
  return {
    id, type, startedAt, endedAt,
    durationSec: durationMin! * 60,
    plannedDurationSec: null,
    status: 'completed',
    bellIntervalMin: 0,
    backgroundSoundId: null,
    // ใส่ช่วงฝึกไว้ด้วย สถิติจะได้แบ่งเวลาข้ามเที่ยงคืนแบบเดียวกับที่จับเวลาจริง
    runIntervals: [{ startedAt, endedAt }],
    source: 'manual',
  };
}

export function buildManualChant(
  id: string, prayerId: string, prayerTitle: string, date: string, time: string,
  rounds: number | null, durationMin: number | null, nowMs: number,
): ChantSession {
  if (!prayerId || !prayerTitle.trim()) throw new BackfillError('กรุณาเลือกบทสวด');
  if (rounds !== null && (!Number.isInteger(rounds) || rounds < 1 || rounds > 9999)) {
    throw new BackfillError('จำนวนรอบต้องเป็นจำนวนเต็ม 1–9999');
  }
  checkDuration(durationMin, false);
  const durationMs = (durationMin ?? 0) * 60_000;
  const startMs = checkStart(date, time, (start) => start + durationMs, nowMs);
  return {
    id, prayerId, prayerTitleSnapshot: prayerTitle.trim(), rounds,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(startMs + durationMs).toISOString(),
    durationSec: durationMin === null ? null : durationMin * 60,
    source: 'manual',
  };
}
