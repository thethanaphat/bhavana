import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecordStats, periodWindow } from '../.test-build/features/records/stats.js';

function at(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function practice(type, start, end, durationSec, intervals) {
  return {
    id: `${type}-${start}`, type, startedAt: start, endedAt: end,
    durationSec, plannedDurationSec: null, status: 'completed',
    bellIntervalMin: 0, backgroundSoundId: null, runIntervals: intervals,
  };
}

test('practice time crossing local midnight is split, and paused gaps are excluded', () => {
  const firstStart = at(2026, 9, 19, 23, 50);
  const firstEnd = at(2026, 9, 19, 23, 55);
  const secondStart = at(2026, 9, 20, 0, 5);
  const secondEnd = at(2026, 9, 20, 0, 15);
  const session = practice('sitting', firstStart, secondEnd, 900, [
    { startedAt: firstStart, endedAt: firstEnd },
    { startedAt: secondStart, endedAt: secondEnd },
  ]);
  const today = buildRecordStats([session], [], null, 'today', new Date(2026, 8, 20, 12).getTime());
  assert.equal(today.sitting.count, 1);
  assert.equal(today.sitting.durationSec, 600);
  const all = buildRecordStats([session], [], null, 'all', new Date(2026, 8, 20, 12).getTime());
  assert.equal(all.sitting.durationSec, 900);
});

test('week starts Monday and month starts local first day', () => {
  const monday = new Date(2026, 8, 21, 12).getTime();
  assert.equal(new Date(periodWindow('week', monday).startMs).getDay(), 1);
  assert.equal(new Date(periodWindow('week', monday).startMs).getDate(), 21);
  const sundayStart = at(2026, 9, 20, 23, 50);
  const mondayEnd = at(2026, 9, 21, 0, 10);
  const session = practice('walking', sundayStart, mondayEnd, 1200, [{ startedAt: sundayStart, endedAt: mondayEnd }]);
  assert.equal(buildRecordStats([session], [], null, 'week', monday).walking.durationSec, 600);
  const october = new Date(2026, 9, 1, 12).getTime();
  assert.equal(new Date(periodWindow('month', october).startMs).getDate(), 1);
  assert.equal(new Date(periodWindow('month', october).startMs).getMonth(), 9);
});

test('legacy sitting total affects all-time only; chanting rounds remain separate from minutes', () => {
  const now = new Date(2026, 8, 20, 12).getTime();
  const session = practice('sitting', at(2026, 9, 20, 8, 0), at(2026, 9, 20, 8, 20), 1200, [
    { startedAt: at(2026, 9, 20, 8, 0), endedAt: at(2026, 9, 20, 8, 20) },
  ]);
  const chants = [
    { id: 'chant1', prayerId: 'itipiso', prayerTitleSnapshot: 'อิติปิโส', rounds: 7, startedAt: at(2026, 9, 20, 9, 0), endedAt: at(2026, 9, 20, 9, 10), durationSec: 600 },
    { id: 'chant2', prayerId: 'bahung', prayerTitleSnapshot: 'พาหุง', rounds: null, startedAt: at(2026, 9, 20, 10, 0), endedAt: at(2026, 9, 20, 10, 0), durationSec: null },
  ];
  const baseline = { id: 'sitting', sittingDurationSec: 170 * 3600 + 29 * 60, asOfDate: '2026-09-19', note: '' };
  const today = buildRecordStats([session], chants, baseline, 'today', now);
  assert.equal(today.sitting.durationSec, 1200);
  assert.equal(today.legacySittingSec, 0);
  assert.deepEqual(today.chanting, { count: 2, rounds: 7, durationSec: 600, timedCount: 1 });
  const all = buildRecordStats([session], chants, baseline, 'all', now);
  assert.equal(all.sitting.count, 1);
  assert.equal(all.legacySittingSec, baseline.sittingDurationSec);
});
