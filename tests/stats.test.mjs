import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBuckets, buildRecordStats, containsNow, monthGoalProgress, periodWindow, shiftAnchor } from '../.test-build/features/records/stats.js';

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
  const today = buildRecordStats([session], [], null, 'day', new Date(2026, 8, 20, 12).getTime());
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
  const today = buildRecordStats([session], chants, baseline, 'day', now);
  assert.equal(today.sitting.durationSec, 1200);
  assert.equal(today.legacySittingSec, 0);
  assert.deepEqual(today.chanting, { count: 2, rounds: 7, durationSec: 600, timedCount: 1 });
  const all = buildRecordStats([session], chants, baseline, 'all', now);
  assert.equal(all.sitting.count, 1);
  assert.equal(all.legacySittingSec, baseline.sittingDurationSec);
});

test('periods can be shifted back and the window covers the whole period', () => {
  const now = new Date(2026, 9, 2, 9).getTime(); // ศุกร์ 2 ต.ค. 2026
  const lastWeek = shiftAnchor('week', now, -1);
  assert.equal(new Date(lastWeek).getDate(), 21);
  assert.equal(new Date(lastWeek).getMonth(), 8);
  assert.equal(containsNow('week', lastWeek, now), false);
  assert.equal(containsNow('week', shiftAnchor('week', lastWeek, 1), now), true);
  const september = periodWindow('month', shiftAnchor('month', now, -1));
  assert.equal(new Date(september.startMs).getDate(), 1);
  assert.equal(new Date(september.endMs).getMonth(), 9);
  const day = periodWindow('day', now);
  assert.equal(day.endMs - day.startMs, 24 * 3600 * 1000);
});

test('stats for a past week include only that week', () => {
  const now = new Date(2026, 9, 2, 9).getTime();
  const old = practice('sitting', at(2026, 9, 23, 6, 0), at(2026, 9, 23, 6, 30), 1800, [
    { startedAt: at(2026, 9, 23, 6, 0), endedAt: at(2026, 9, 23, 6, 30) },
  ]);
  const recent = practice('walking', at(2026, 10, 1, 6, 0), at(2026, 10, 1, 6, 20), 1200, [
    { startedAt: at(2026, 10, 1, 6, 0), endedAt: at(2026, 10, 1, 6, 20) },
  ]);
  const lastWeek = buildRecordStats([old, recent], [], null, 'week', shiftAnchor('week', now, -1));
  assert.equal(lastWeek.sitting.durationSec, 1800);
  assert.equal(lastWeek.walking.count, 0);
});

test('buckets: week has 7 days, month has a bar per day, all-time is monthly', () => {
  const now = new Date(2026, 9, 2, 9).getTime();
  const session = practice('sitting', at(2026, 9, 29, 23, 50), at(2026, 9, 30, 0, 10), 1200, [
    { startedAt: at(2026, 9, 29, 23, 50), endedAt: at(2026, 9, 30, 0, 10) },
  ]);
  const chant = { id: 'c', prayerId: 'itipiso', prayerTitleSnapshot: 'อิติปิโส', rounds: 3, startedAt: at(2026, 10, 1, 7, 0), endedAt: at(2026, 10, 1, 7, 0), durationSec: null };
  const week = buildBuckets([session], [chant], 'week', now, now);
  assert.equal(week.length, 7);
  assert.equal(week[1].sittingSec, 600); // อังคาร 29 ก.ย.
  assert.equal(week[2].sittingSec, 600); // พุธ 30 ก.ย. ส่วนหลังเที่ยงคืน
  assert.equal(week[3].chantCount, 1);
  assert.equal(buildBuckets([], [], 'month', now, now).length, 31);
  assert.equal(buildBuckets([], [], 'day', now, now).length, 0);
  const all = buildBuckets([session], [chant], 'all', now, now);
  assert.equal(all.length, 2);
  assert.equal(all[0].sittingSec, 1200);
  assert.equal(all[1].chantCount, 1);
});

function chantAt(prayerId, start, rounds) {
  return { id: `${prayerId}-${start}`, prayerId, prayerTitleSnapshot: prayerId, rounds, startedAt: start, endedAt: start, durationSec: null };
}

test('chant buckets sum rounds per day', () => {
  const now = new Date(2026, 9, 2, 21).getTime();
  const chants = [chantAt('millionaire-chant', at(2026, 10, 1, 7, 0), 108), chantAt('millionaire-chant', at(2026, 10, 1, 20, 0), 9), chantAt('bahung', at(2026, 10, 2, 7, 0), null)];
  const week = buildBuckets([], chants, 'week', now, now);
  assert.equal(week[3].chantRounds, 117);
  assert.equal(week[3].chantCount, 2);
  assert.equal(week[4].chantRounds, 0);
  assert.equal(week[4].chantCount, 1);
});

test('monthly goal counts only the chosen prayer and spreads the rest over remaining days', () => {
  const now = new Date(2026, 9, 2, 21).getTime(); // 2 ต.ค. เหลือ 30 วันรวมวันนี้
  const chants = [
    chantAt('millionaire-chant', at(2026, 10, 1, 7, 0), 300),
    chantAt('millionaire-chant', at(2026, 9, 30, 7, 0), 500), // เดือนก่อน ไม่นับ
    chantAt('bahung', at(2026, 10, 2, 7, 0), 50),
  ];
  const progress = monthGoalProgress(chants, 'millionaire-chant', 1000, 'week', now, now);
  assert.equal(progress.rounds, 300);
  assert.equal(progress.daysLeft, 30);
  assert.equal(progress.perDayNeeded, 24); // 700 / 30 ปัดขึ้น
  assert.equal(monthGoalProgress(chants, null, 1000, 'day', now, now).rounds, 350);
  const september = monthGoalProgress(chants, 'millionaire-chant', 400, 'month', new Date(2026, 8, 15).getTime(), now);
  assert.equal(september.rounds, 500);
  assert.equal(september.daysLeft, null);
  assert.equal(september.perDayNeeded, null);
  const allView = monthGoalProgress(chants, 'millionaire-chant', 200, 'all', new Date(2020, 0, 1).getTime(), now);
  assert.equal(allView.rounds, 300);
  assert.equal(allView.perDayNeeded, null); // ถึงเป้าแล้ว
});
