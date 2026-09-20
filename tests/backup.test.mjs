import test from 'node:test';
import assert from 'node:assert/strict';
import { backupFileName, buildBackup, readBackup } from '../.test-build/data/backup.js';

const practice = {
  id: 'p1', type: 'sitting', startedAt: '2026-09-20T02:00:00.000Z', endedAt: '2026-09-20T02:20:00.000Z',
  durationSec: 1200, plannedDurationSec: 1200, status: 'completed', bellIntervalMin: 5, backgroundSoundId: 'rain',
};
const chant = {
  id: 'c1', prayerId: 'itipiso', prayerTitleSnapshot: 'อิติปิโส', rounds: 9,
  startedAt: '2026-09-20T03:00:00.000Z', endedAt: '2026-09-20T03:10:00.000Z', durationSec: 600,
};
const prayer = { id: 'x1', title: 'บทของผม', text: 'เนื้อหา', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' };

function file(overrides = {}) {
  return {
    ...buildBackup({
      settings: { id: 'main', sitting: { durationMin: 20, customMinutes: 25, bellIntervalMin: 5, backgroundSoundId: 'rain' },
        walking: { durationMin: 15, customMinutes: 25, bellIntervalMin: 0, backgroundSoundId: null }, textScale: 1.1, theme: 'dark' },
      practiceSessions: [practice], chantSessions: [chant], customPrayers: [prayer],
      legacyBaseline: { id: 'sitting', sittingDurationSec: 36000, asOfDate: '2026-01-01', note: 'จากแอปเก่า' },
    }, '2026-09-20T15:00:00.000Z'),
    ...overrides,
  };
}

test('a file written by the app reads back with every record intact', () => {
  const result = readBackup(JSON.parse(JSON.stringify(file())));
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { practiceSessions: 1, chantSessions: 1, customPrayers: 1, hasLegacyBaseline: true });
  assert.deepEqual(result.data.practiceSessions[0], practice);
  assert.deepEqual(result.data.chantSessions[0], chant);
  assert.equal(result.data.settings.theme, 'dark');
  assert.equal(result.data.settings.textScale, 1.1);
});

test('files from another app or another schema version are refused', () => {
  for (const raw of [null, 'ข้อความ', {}, { format: 'something-else' }, { ...file(), format: 'other' }]) {
    assert.equal(readBackup(raw).ok, false, `ควรปฏิเสธ: ${JSON.stringify(raw)}`);
  }
  const future = readBackup({ ...file(), version: 2 });
  assert.equal(future.ok, false);
  assert.match(future.errors[0], /เวอร์ชัน 2/);
});

test('one broken record rejects the whole file instead of importing part of it', () => {
  const broken = file();
  broken.practiceSessions = [practice, { ...practice, id: 'p2', durationSec: -5 }];
  const result = readBackup(JSON.parse(JSON.stringify(broken)));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /ลำดับที่ 2.*durationSec/);
});

test('an unknown bell interval or sound is caught rather than stored', () => {
  const odd = file();
  odd.practiceSessions = [{ ...practice, bellIntervalMin: 7, backgroundSoundId: 'ocean' }];
  const result = readBackup(JSON.parse(JSON.stringify(odd)));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /bellIntervalMin, backgroundSoundId/);
});

test('broken settings fall back to defaults without losing the history', () => {
  const odd = file({ settings: { theme: 'neon', textScale: 99, sitting: 'ไม่ใช่ข้อมูล' } });
  const result = readBackup(JSON.parse(JSON.stringify(odd)));
  assert.equal(result.ok, true, 'การตั้งค่าเสียไม่ควรทำให้ทั้งไฟล์ใช้ไม่ได้');
  assert.equal(result.data.settings.theme, 'system');
  assert.equal(result.data.settings.textScale, 1);
  assert.equal(result.data.practiceSessions.length, 1);
});

test('missing lists are treated as empty, not as an error', () => {
  const sparse = { format: 'mindful-practice-backup', version: 1, exportedAt: '2026-09-20T15:00:00.000Z' };
  const result = readBackup(sparse);
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { practiceSessions: 0, chantSessions: 0, customPrayers: 0, hasLegacyBaseline: false });
});

test('the file name carries the export date', () => {
  assert.equal(backupFileName('2026-09-20T15:00:00.000Z'), 'mindful-practice-2026-09-20.json');
});
