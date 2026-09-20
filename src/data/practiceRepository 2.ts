import { newId } from './id';
import { openDatabase } from './db';
import type { ActiveSession, PracticePreference, PracticeSession, PracticeType } from './models';
import { dueAtMs, elapsedMs, isDue } from '../features/practice/timer';

function fail(tx: IDBTransaction, fallback: string): Error {
  return tx.error ?? new Error(fallback);
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activeSession', 'readonly');
    const request = tx.objectStore('activeSession').get('current');
    request.onsuccess = () => resolve((request.result as ActiveSession | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Unable to read active session'));
  });
}

export async function startPracticeSession(type: PracticeType, preference: PracticePreference, nowMs = Date.now()): Promise<ActiveSession> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activeSession', 'readwrite');
    const store = tx.objectStore('activeSession');
    let result: ActiveSession;
    const request = store.get('current');
    request.onsuccess = () => {
      const existing = request.result as ActiveSession | undefined;
      if (existing) {
        result = existing;
        return;
      }
      result = {
        id: 'current',
        sessionId: newId(),
        type,
        startedAt: new Date(nowMs).toISOString(),
        accumulatedPauseMs: 0,
        pausedAt: null,
        plannedDurationSec: preference.durationMin === null ? null : preference.durationMin * 60,
        bellIntervalMin: preference.bellIntervalMin,
        backgroundSoundId: preference.backgroundSoundId ?? null,
        completedIntervals: [],
        runningSince: new Date(nowMs).toISOString(),
      };
      store.put(result);
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(fail(tx, 'Unable to start practice'));
    tx.onabort = () => reject(fail(tx, 'Unable to start practice'));
  });
}

async function changePauseState(sessionId: string, action: 'pause' | 'resume', nowMs: number): Promise<ActiveSession | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activeSession', 'readwrite');
    const store = tx.objectStore('activeSession');
    let result: ActiveSession | null = null;
    const request = store.get('current');
    request.onsuccess = () => {
      const active = request.result as ActiveSession | undefined;
      if (!active || active.sessionId !== sessionId) return;
      if (action === 'pause' && active.pausedAt === null) {
        if (active.runningSince !== undefined) {
          const endMs = Math.max(Date.parse(active.runningSince ?? active.startedAt), nowMs);
          active.completedIntervals = [...(active.completedIntervals ?? []), { startedAt: active.runningSince ?? active.startedAt, endedAt: new Date(endMs).toISOString() }];
          active.runningSince = null;
        }
        active.pausedAt = new Date(nowMs).toISOString();
        store.put(active);
      } else if (action === 'resume' && active.pausedAt !== null) {
        active.accumulatedPauseMs += Math.max(0, nowMs - Date.parse(active.pausedAt));
        active.pausedAt = null;
        if (active.runningSince !== undefined) active.runningSince = new Date(nowMs).toISOString();
        store.put(active);
      }
      result = active;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(fail(tx, 'Unable to update practice'));
    tx.onabort = () => reject(fail(tx, 'Unable to update practice'));
  });
}

export function pausePracticeSession(sessionId: string, nowMs = Date.now()): Promise<ActiveSession | null> {
  return changePauseState(sessionId, 'pause', nowMs);
}

export function resumePracticeSession(sessionId: string, nowMs = Date.now()): Promise<ActiveSession | null> {
  return changePauseState(sessionId, 'resume', nowMs);
}

export async function finishPracticeSession(sessionId: string, mode: 'user' | 'due', nowMs = Date.now()): Promise<PracticeSession | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['activeSession', 'practiceSessions'], 'readwrite');
    const activeStore = tx.objectStore('activeSession');
    const sessionStore = tx.objectStore('practiceSessions');
    let result: PracticeSession | null = null;
    const request = activeStore.get('current');
    request.onsuccess = () => {
      const active = request.result as ActiveSession | undefined;
      if (!active || active.sessionId !== sessionId) return;
      const due = isDue(active, nowMs);
      if (mode === 'due' && !due) return;
      const durationSec = due && active.plannedDurationSec !== null
        ? active.plannedDurationSec
        : Math.floor(elapsedMs(active, nowMs) / 1000);
      const endedMs = due ? dueAtMs(active)! : nowMs;
      const runIntervals = active.completedIntervals === undefined || active.runningSince === undefined
        ? undefined
        : [...active.completedIntervals];
      const runningSince = active.runningSince;
      if (runIntervals && runningSince) {
        const startMs = Date.parse(runningSince);
        if (endedMs > startMs) runIntervals.push({ startedAt: runningSince, endedAt: new Date(endedMs).toISOString() });
      }
      result = {
        id: active.sessionId,
        type: active.type,
        startedAt: active.startedAt,
        endedAt: new Date(endedMs).toISOString(),
        durationSec,
        plannedDurationSec: active.plannedDurationSec,
        status: due || active.plannedDurationSec === null ? 'completed' : 'stopped',
        bellIntervalMin: active.bellIntervalMin,
        backgroundSoundId: active.backgroundSoundId,
        runIntervals,
      };
      sessionStore.put(result);
      activeStore.delete('current');
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(fail(tx, 'Unable to finish practice'));
    tx.onabort = () => reject(fail(tx, 'Unable to finish practice'));
  });
}

export async function discardPracticeSession(sessionId: string): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activeSession', 'readwrite');
    const store = tx.objectStore('activeSession');
    let deleted = false;
    const request = store.get('current');
    request.onsuccess = () => {
      const active = request.result as ActiveSession | undefined;
      if (active?.sessionId === sessionId) {
        store.delete('current');
        deleted = true;
      }
    };
    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(fail(tx, 'Unable to discard practice'));
    tx.onabort = () => reject(fail(tx, 'Unable to discard practice'));
  });
}

export async function listPracticeSessions(): Promise<PracticeSession[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('practiceSessions', 'readonly');
    const request = tx.objectStore('practiceSessions').getAll();
    request.onsuccess = () => resolve((request.result as PracticeSession[]).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    request.onerror = () => reject(request.error ?? new Error('Unable to read practice sessions'));
  });
}
