import type { ActiveSession } from '../../data/models';
import { elapsedMs } from './timer.js';

// ยอมให้ระฆังดังช้าได้ถึง 15 วินาที เพราะระฆังที่ช้าไปสิบวินาทียังทำหน้าที่บอกช่วงเวลาได้
// ดีกว่าเงียบหายไปเลย เดิมตั้งไว้ 2.5 วินาที ซึ่งแคบกว่าความหน่วงที่ iOS ทำได้จริงตอน
// throttle timer แม้เปิดหน้าจอค้างไว้ เพดานนี้ยังกันไม่ให้ระฆังดังย้อนหลังหลังแอปถูกพักนาน ๆ
export const bellLatenessLimitMs = 15_000;

export interface IntervalBellResult {
  index: number;
  ring: boolean;
  latenessMs: number;
}

export function intervalBellIndex(session: ActiveSession, nowMs: number): number {
  if (session.bellIntervalMin === 0) return 0;
  const intervalMs = session.bellIntervalMin * 60_000;
  return Math.floor(elapsedMs(session, nowMs) / intervalMs);
}

export function latenessAllowanceMs(intervalMs: number): number {
  // ครึ่งหนึ่งของช่วงระฆังเป็นเพดานธรรมชาติ กันไม่ให้ระฆังใบหนึ่งไปดังทับจังหวะของใบถัดไป
  return Math.min(intervalMs / 2, bellLatenessLimitMs);
}

export function intervalBellResult(session: ActiveSession, nowMs: number, previousIndex: number): IntervalBellResult {
  if (session.bellIntervalMin === 0 || session.pausedAt !== null) return { index: previousIndex, ring: false, latenessMs: 0 };
  const elapsed = elapsedMs(session, nowMs);
  const intervalMs = session.bellIntervalMin * 60_000;
  const index = Math.floor(elapsed / intervalMs);
  if (index <= previousIndex) return { index: previousIndex, ring: false, latenessMs: 0 };
  const latenessMs = elapsed - index * intervalMs;
  return { index, ring: index > 0 && latenessMs <= latenessAllowanceMs(intervalMs), latenessMs };
}
