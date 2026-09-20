import test from 'node:test';
import assert from 'node:assert/strict';
import { newId } from '../.test-build/data/id.js';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// newId อ่าน globalThis.crypto ตอนเรียก จึงต้องคาสตับไว้ตลอดช่วงที่เรียก ไม่ใช่แค่ตอน import
function withCrypto(stub, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: stub, configurable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(globalThis, 'crypto', original);
  }
}

test('uses native randomUUID when the page is a secure context', () => {
  const id = withCrypto({ randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }, newId);
  assert.equal(id, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
});

test('falls back to getRandomValues when randomUUID is missing on plain http', () => {
  const id = withCrypto({ getRandomValues: (a) => { a.fill(0xff); return a; } }, newId);
  assert.match(id, uuidV4, `ควรเป็น UUID v4 แต่ได้ ${id}`);
});

test('still returns unique ids with no Web Crypto at all', () => {
  const ids = withCrypto(undefined, () => new Set(Array.from({ length: 500 }, newId)));
  for (const id of ids) assert.match(id, uuidV4);
  assert.equal(ids.size, 500, 'id ต้องไม่ซ้ำกัน');
});
