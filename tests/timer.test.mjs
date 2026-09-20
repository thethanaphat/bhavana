import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsedMs, remainingMs, isDue, dueAtMs, formatClock } from '../.test-build/features/practice/timer.js';

const start = new Date(0).toISOString();
const twentyMinutes = { startedAt: start, accumulatedPauseMs: 0, pausedAt: null, plannedDurationSec: 1200 };

test('time comes from timestamps after a long background gap', () => {
  assert.equal(elapsedMs(twentyMinutes, 7 * 60_000), 7 * 60_000);
  assert.equal(remainingMs(twentyMinutes, 7 * 60_000), 13 * 60_000);
  assert.equal(isDue(twentyMinutes, 20 * 60_000), true);
  assert.equal(dueAtMs(twentyMinutes), 20 * 60_000);
});

test('pause freezes elapsed time and shifts the due timestamp', () => {
  const paused = { ...twentyMinutes, pausedAt: new Date(5 * 60_000).toISOString() };
  assert.equal(elapsedMs(paused, 9 * 60_000), 5 * 60_000);
  assert.equal(isDue(paused, 30 * 60_000), false);

  const resumed = { ...twentyMinutes, accumulatedPauseMs: 4 * 60_000 };
  assert.equal(elapsedMs(resumed, 9 * 60_000), 5 * 60_000);
  assert.equal(dueAtMs(resumed), 24 * 60_000);
  assert.equal(isDue(resumed, 24 * 60_000), true);
});

test('open session has no due time and clock supports long durations', () => {
  const open = { ...twentyMinutes, plannedDurationSec: null };
  assert.equal(remainingMs(open, 9 * 60_000), null);
  assert.equal(isDue(open, 9 * 60_000), false);
  assert.equal(formatClock(65_000), '01:05');
  assert.equal(formatClock(3_665_000), '1:01:05');
});
