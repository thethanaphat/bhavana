import type { ChantSession, LegacyBaseline, PracticeSession, PracticeType } from '../../data/models';

export type StatsPeriod = 'day' | 'week' | 'month' | 'all';

export interface TimeWindow {
  startMs: number;
  endMs: number;
}

export interface PracticeTotals {
  count: number;
  durationSec: number;
}

export interface ChantTotals {
  count: number;
  rounds: number;
  durationSec: number;
  timedCount: number;
}

export interface RecordStats {
  sitting: PracticeTotals;
  walking: PracticeTotals;
  chanting: ChantTotals;
  legacySittingSec: number;
}

export interface StatsBucket {
  startMs: number;
  endMs: number;
  sittingSec: number;
  walkingSec: number;
  chantCount: number;
  chantRounds: number;
}

function periodStart(period: Exclude<StatsPeriod, 'all'>, anchorMs: number): Date {
  const anchor = new Date(anchorMs);
  if (period === 'day') return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (period === 'week') {
    const mondayOffset = (anchor.getDay() + 6) % 7;
    return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - mondayOffset);
  }
  return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
}

// เลื่อนด้วยวันที่ตามปฏิทิน ไม่ใช่บวก 24 ชั่วโมง เพื่อให้ถูกแม้ timezone ของเครื่องมีเวลาออมแสง
function addPeriods(period: Exclude<StatsPeriod, 'all'>, start: Date, steps: number): Date {
  if (period === 'day') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + steps);
  if (period === 'week') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + steps * 7);
  return new Date(start.getFullYear(), start.getMonth() + steps, 1);
}

// ช่วงเต็มของวัน/สัปดาห์/เดือนที่มี anchor อยู่ ไม่ตัดที่เวลาปัจจุบัน
// เพราะบันทึกย้อนหลังห้ามอยู่ในอนาคตอยู่แล้ว และกราฟต้องเห็นวันที่ยังมาไม่ถึงเป็นช่องว่าง
export function periodWindow(period: StatsPeriod, anchorMs: number): TimeWindow {
  if (period === 'all') return { startMs: -Infinity, endMs: Infinity };
  const start = periodStart(period, anchorMs);
  return { startMs: start.getTime(), endMs: addPeriods(period, start, 1).getTime() };
}

export function shiftAnchor(period: StatsPeriod, anchorMs: number, steps: number): number {
  if (period === 'all') return anchorMs;
  return addPeriods(period, periodStart(period, anchorMs), steps).getTime();
}

export function containsNow(period: StatsPeriod, anchorMs: number, nowMs: number): boolean {
  const window = periodWindow(period, anchorMs);
  return nowMs >= window.startMs && nowMs < window.endMs;
}

function overlapMs(startMs: number, endMs: number, window: TimeWindow): number {
  return Math.max(0, Math.min(endMs, window.endMs) - Math.max(startMs, window.startMs));
}

function practiceDurationMs(session: PracticeSession, window: TimeWindow): number {
  if (window.startMs === -Infinity && window.endMs === Infinity) return session.durationSec * 1000;
  const intervals = session.runIntervals;
  if (intervals && intervals.length > 0) {
    const durationMs = intervals.reduce((sum, interval) => sum + overlapMs(Date.parse(interval.startedAt), Date.parse(interval.endedAt), window), 0);
    return Math.min(durationMs, session.durationSec * 1000);
  }
  // Sessions recorded before runIntervals existed have only a total duration.
  // Anchor that duration at the end time when assigning it to local periods.
  const endedMs = Date.parse(session.endedAt);
  return overlapMs(endedMs - session.durationSec * 1000, endedMs, window);
}

function inWindow(timestamp: string, window: TimeWindow): boolean {
  const ms = Date.parse(timestamp);
  return ms >= window.startMs && ms < window.endMs;
}

export function practiceInWindow(session: PracticeSession, window: TimeWindow): boolean {
  return practiceDurationMs(session, window) > 0 || (session.durationSec === 0 && inWindow(session.endedAt, window));
}

export function chantInWindow(chant: ChantSession, window: TimeWindow): boolean {
  return inWindow(chant.endedAt, window);
}

export function buildRecordStats(
  sessions: PracticeSession[], chants: ChantSession[], baseline: LegacyBaseline | null,
  period: StatsPeriod, anchorMs = Date.now(),
): RecordStats {
  const window = periodWindow(period, anchorMs);
  const counts: Record<PracticeType, number> = { sitting: 0, walking: 0 };
  const durationMs: Record<PracticeType, number> = { sitting: 0, walking: 0 };
  for (const session of sessions) {
    if (!practiceInWindow(session, window)) continue;
    counts[session.type] += 1;
    durationMs[session.type] += practiceDurationMs(session, window);
  }
  const chanting: ChantTotals = { count: 0, rounds: 0, durationSec: 0, timedCount: 0 };
  for (const chant of chants) {
    if (!chantInWindow(chant, window)) continue;
    chanting.count += 1;
    chanting.rounds += chant.rounds ?? 0;
    if (chant.durationSec !== null) {
      chanting.durationSec += chant.durationSec;
      chanting.timedCount += 1;
    }
  }
  return {
    sitting: { count: counts.sitting, durationSec: Math.floor(durationMs.sitting / 1000) },
    walking: { count: counts.walking, durationSec: Math.floor(durationMs.walking / 1000) },
    chanting,
    legacySittingSec: period === 'all' ? baseline?.sittingDurationSec ?? 0 : 0,
  };
}

function earliestRecordMs(sessions: PracticeSession[], chants: ChantSession[]): number | null {
  let earliest = Infinity;
  for (const session of sessions) earliest = Math.min(earliest, Date.parse(session.startedAt));
  for (const chant of chants) earliest = Math.min(earliest, Date.parse(chant.startedAt));
  return Number.isFinite(earliest) ? earliest : null;
}

// แท่งกราฟ: สัปดาห์ = 7 วัน, เดือน = รายวัน, ทั้งหมด = รายเดือนย้อนหลังไม่เกิน 12 เดือน
// วันเดียวไม่มีกราฟ เพราะส่วนใหญ่ฝึกวันละไม่กี่ครั้ง แท่งรายชั่วโมงจะว่างเกือบหมด
export function buildBuckets(
  sessions: PracticeSession[], chants: ChantSession[], period: StatsPeriod, anchorMs: number, nowMs = Date.now(),
): StatsBucket[] {
  const starts: Date[] = [];
  if (period === 'week' || period === 'month') {
    const window = periodWindow(period, anchorMs);
    for (let day = new Date(window.startMs); day.getTime() < window.endMs; day = addPeriods('day', day, 1)) starts.push(day);
  } else if (period === 'all') {
    const current = periodStart('month', nowMs);
    const earliest = earliestRecordMs(sessions, chants);
    const first = earliest === null ? current : periodStart('month', Math.min(earliest, nowMs));
    const oldest = addPeriods('month', current, -11);
    for (let month = first < oldest ? oldest : first; month <= current; month = addPeriods('month', month, 1)) starts.push(month);
  } else {
    return [];
  }
  const unit = period === 'all' ? 'month' : 'day';
  return starts.map((start) => {
    const window = { startMs: start.getTime(), endMs: addPeriods(unit, start, 1).getTime() };
    const bucket: StatsBucket = { ...window, sittingSec: 0, walkingSec: 0, chantCount: 0, chantRounds: 0 };
    for (const session of sessions) {
      const seconds = Math.floor(practiceDurationMs(session, window) / 1000);
      if (session.type === 'sitting') bucket.sittingSec += seconds;
      else bucket.walkingSec += seconds;
    }
    for (const chant of chants) {
      if (!chantInWindow(chant, window)) continue;
      bucket.chantCount += 1;
      bucket.chantRounds += chant.rounds ?? 0;
    }
    return bucket;
  });
}

export interface GoalProgress {
  monthStartMs: number;
  rounds: number;
  goal: number;
  // นับวันนี้ด้วย เพราะวันนี้ยังสวดได้อีก; null = เดือนที่ผ่านไปแล้วหรือยังมาไม่ถึง
  daysLeft: number | null;
  perDayNeeded: number | null;
}

// เป้าเป็นรายเดือนเสมอ ไม่ว่ากำลังดูช่วงไหน จึงใช้เดือนที่ anchor อยู่
// ยกเว้นมุมมอง "ทั้งหมด" ที่ไม่มี anchor ความหมาย ให้ใช้เดือนปัจจุบัน
export function monthGoalProgress(
  chants: ChantSession[], prayerId: string | null, goal: number, period: StatsPeriod, anchorMs: number, nowMs = Date.now(),
): GoalProgress {
  const window = periodWindow('month', period === 'all' ? nowMs : anchorMs);
  let rounds = 0;
  for (const chant of chants) {
    if ((prayerId === null || chant.prayerId === prayerId) && chantInWindow(chant, window)) rounds += chant.rounds ?? 0;
  }
  let daysLeft: number | null = null;
  if (nowMs >= window.startMs && nowMs < window.endMs) {
    const today = periodStart('day', nowMs);
    const end = new Date(window.endMs);
    daysLeft = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  }
  const remaining = Math.max(0, goal - rounds);
  return {
    monthStartMs: window.startMs, rounds, goal, daysLeft,
    perDayNeeded: daysLeft && remaining ? Math.ceil(remaining / daysLeft) : null,
  };
}
