import type { ChantSession, LegacyBaseline, PracticeSession, PracticeType } from '../../data/models';

export type StatsPeriod = 'today' | 'week' | 'month' | 'all';

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

export function periodWindow(period: StatsPeriod, nowMs: number): TimeWindow {
  if (period === 'all') return { startMs: -Infinity, endMs: nowMs + 1 };
  const now = new Date(nowMs);
  let start: Date;
  if (period === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    const mondayOffset = (now.getDay() + 6) % 7;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { startMs: start.getTime(), endMs: nowMs + 1 };
}

function overlapMs(startMs: number, endMs: number, window: TimeWindow): number {
  return Math.max(0, Math.min(endMs, window.endMs) - Math.max(startMs, window.startMs));
}

function practiceDurationMs(session: PracticeSession, window: TimeWindow, period: StatsPeriod): number {
  if (period === 'all') return session.durationSec * 1000;
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

export function buildRecordStats(
  sessions: PracticeSession[], chants: ChantSession[], baseline: LegacyBaseline | null,
  period: StatsPeriod, nowMs = Date.now(),
): RecordStats {
  const window = periodWindow(period, nowMs);
  const counts: Record<PracticeType, number> = { sitting: 0, walking: 0 };
  const durationMs: Record<PracticeType, number> = { sitting: 0, walking: 0 };
  for (const session of sessions) {
    const portionMs = practiceDurationMs(session, window, period);
    if (portionMs > 0 || (session.durationSec === 0 && inWindow(session.endedAt, window))) {
      counts[session.type] += 1;
      durationMs[session.type] += portionMs;
    }
  }
  const chanting: ChantTotals = { count: 0, rounds: 0, durationSec: 0, timedCount: 0 };
  for (const chant of chants) {
    if (!inWindow(chant.endedAt, window)) continue;
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
