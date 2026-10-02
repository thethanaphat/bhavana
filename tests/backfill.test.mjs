import test from 'node:test';
import assert from 'node:assert/strict';
import { BackfillError, buildManualChant, buildManualPractice, localDateTimeMs } from '../.test-build/features/records/backfill.js';
import { buildRecordStats } from '../.test-build/features/records/stats.js';
import { readBackup } from '../.test-build/data/backup.js';

const now = new Date(2026, 9, 2, 9, 0).getTime();

test('local date and time are parsed in device timezone and impossible dates rejected', () => {
  assert.equal(localDateTimeMs('2026-10-01', '06:30'), new Date(2026, 9, 1, 6, 30).getTime());
  assert.equal(localDateTimeMs('2026-02-31', '06:30'), null);
  assert.equal(localDateTimeMs('2026-10-01', '25:00'), null);
  assert.equal(localDateTimeMs('', '06:30'), null);
});

test('manual practice is a completed session marked manual, counted on its own day', () => {
  const session = buildManualPractice('m1', 'sitting', '2026-10-01', '06:30', 45, now);
  assert.equal(session.source, 'manual');
  assert.equal(session.durationSec, 2700);
  assert.equal(session.startedAt, new Date(2026, 9, 1, 6, 30).toISOString());
  assert.equal(session.endedAt, new Date(2026, 9, 1, 7, 15).toISOString());
  const day = buildRecordStats([session], [], null, 'day', new Date(2026, 9, 1, 12).getTime());
  assert.equal(day.sitting.durationSec, 2700);
  assert.equal(buildRecordStats([session], [], null, 'day', now).sitting.count, 0);
});

test('manual practice requires a duration and cannot end in the future', () => {
  assert.throws(() => buildManualPractice('m', 'walking', '2026-10-01', '06:30', null, now), BackfillError);
  assert.throws(() => buildManualPractice('m', 'walking', '2026-10-01', '06:30', 0, now), BackfillError);
  assert.throws(() => buildManualPractice('m', 'walking', '2026-10-02', '08:45', 30, now), /เลยเวลาปัจจุบัน/);
  assert.doesNotThrow(() => buildManualPractice('m', 'walking', '2026-10-02', '08:30', 30, now));
});

test('manual chant allows empty rounds and duration but needs a prayer', () => {
  const chant = buildManualChant('c1', 'bahung', 'พาหุง', '2026-09-30', '20:00', null, null, now);
  assert.equal(chant.source, 'manual');
  assert.equal(chant.durationSec, null);
  assert.equal(chant.startedAt, chant.endedAt);
  assert.throws(() => buildManualChant('c', '', '', '2026-09-30', '20:00', 3, null, now), /เลือกบทสวด/);
  assert.throws(() => buildManualChant('c', 'bahung', 'พาหุง', '2026-09-30', '20:00', 0, null, now), BackfillError);
});

test('backups keep the manual marker and reject unknown sources', () => {
  const session = buildManualPractice('m1', 'sitting', '2026-10-01', '06:30', 45, now);
  const file = { format: 'bhavana-backup', version: 1, exportedAt: new Date(now).toISOString(), practiceSessions: [session] };
  const check = readBackup(file);
  assert.equal(check.ok, true);
  assert.equal(check.data.practiceSessions[0].source, 'manual');
  assert.equal(readBackup({ ...file, practiceSessions: [{ ...session, source: 'robot' }] }).ok, false);
});
