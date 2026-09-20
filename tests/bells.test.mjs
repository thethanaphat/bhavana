import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalBellIndex, intervalBellResult, latenessAllowanceMs } from '../.test-build/features/practice/bells.js';


function assertBell(actual, expected) {
  assert.deepEqual({ index: actual.index, ring: actual.ring }, expected);
}

const session = {
  startedAt: new Date(0).toISOString(),
  accumulatedPauseMs: 0,
  pausedAt: null,
  plannedDurationSec: null,
  bellIntervalMin: 5,
};

test('rings once when active time crosses an interval', () => {
  const boundary = intervalBellResult(session, 5 * 60_000 + 500, 0);
  assertBell(boundary, { index: 1, ring: true });
  assertBell(intervalBellResult(session, 5 * 60_000 + 1000, boundary.index), { index: 1, ring: false });
});

test('pause time does not trigger a bell', () => {
  const paused = { ...session, pausedAt: new Date(4 * 60_000).toISOString() };
  assertBell(intervalBellResult(paused, 20 * 60_000, 0), { index: 0, ring: false });
  const resumed = { ...session, accumulatedPauseMs: 16 * 60_000 };
  assertBell(intervalBellResult(resumed, 21 * 60_000, 0), { index: 1, ring: true });
});

test('missed bells collapse into one instead of a burst after suspension or reload', () => {
  // ข้ามขอบนาทีที่ 5 และ 10 ไปตอนแอปถูกพัก แต่เพิ่งผ่านขอบนาทีที่ 15 มา 10 วินาที
  // จึงควรดังหนึ่งใบตามขอบล่าสุด ไม่ใช่รัวย้อนหลังสามใบ และไม่ใช่เงียบไปเลย
  assertBell(intervalBellResult(session, 15 * 60_000 + 10_000, 0), { index: 3, ring: true });
  assert.equal(intervalBellIndex(session, 15 * 60_000 + 10_000), 3);
  // กลับมาหลังขอบผ่านไป 40 วินาทีแล้ว เกินเพดานความช้า จึงต้องเงียบ
  assertBell(intervalBellResult(session, 15 * 60_000 + 40_000, 0), { index: 3, ring: false });
  assertBell(intervalBellResult(session, 20 * 60_000 + 1000, 3), { index: 4, ring: true });
});

test('disabled intervals never ring', () => {
  assertBell(intervalBellResult({ ...session, bellIntervalMin: 0 }, 30 * 60_000, 0), { index: 0, ring: false });
});

test('one-minute interval rings on every minute for the lock-screen test run', () => {
  const fast = { ...session, bellIntervalMin: 1 };
  const first = intervalBellResult(fast, 60_000 + 200, 0);
  assertBell(first, { index: 1, ring: true });
  assertBell(intervalBellResult(fast, 90_000, first.index), { index: 1, ring: false });
  assertBell(intervalBellResult(fast, 120_000 + 200, first.index), { index: 2, ring: true });
});

test('a bell that is a few seconds late still rings instead of being dropped', () => {
  const fast = { ...session, bellIntervalMin: 1 };
  // 2.5 วินาทีคือเพดานเดิมที่ทำให้ระฆังหายไปเงียบ ๆ ตอน iOS หน่วง timer
  assertBell(intervalBellResult(fast, 60_000 + 6_000, 0), { index: 1, ring: true });
  assertBell(intervalBellResult(fast, 60_000 + 14_000, 0), { index: 1, ring: true });
  // ช้าเกินเพดานยังต้องข้ามเหมือนเดิม เพื่อไม่ให้ดังย้อนหลังหลังแอปถูกพักนาน
  assertBell(intervalBellResult(fast, 60_000 + 20_000, 0), { index: 1, ring: false });
  assert.equal(latenessAllowanceMs(60_000), 15_000);
  assert.equal(latenessAllowanceMs(20_000), 10_000);
});
