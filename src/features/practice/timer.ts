export interface TimerState {
  startedAt: string;
  accumulatedPauseMs: number;
  pausedAt: string | null;
  plannedDurationSec: number | null;
}

export function elapsedMs(session: TimerState, nowMs: number): number {
  const startedMs = Date.parse(session.startedAt);
  const effectiveNow = session.pausedAt ? Date.parse(session.pausedAt) : nowMs;
  return Math.max(0, effectiveNow - startedMs - session.accumulatedPauseMs);
}

export function remainingMs(session: TimerState, nowMs: number): number | null {
  if (session.plannedDurationSec === null) return null;
  return Math.max(0, session.plannedDurationSec * 1000 - elapsedMs(session, nowMs));
}

export function isDue(session: TimerState, nowMs: number): boolean {
  return session.pausedAt === null && session.plannedDurationSec !== null && remainingMs(session, nowMs) === 0;
}

export function dueAtMs(session: TimerState): number | null {
  if (session.plannedDurationSec === null) return null;
  return Date.parse(session.startedAt) + session.accumulatedPauseMs + session.plannedDurationSec * 1000;
}

export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
