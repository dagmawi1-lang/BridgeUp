import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, normalizeSnapshot } from '../src/store.js';

test('normalizes text and removes angle brackets from submitted content', () => {
  const result = normalizeSnapshot({ requests: [{ id: 'r1', title: '<script>alert(1)</script>', description: 'Need <help>', tags: [' Study ', 'study', 'Math'] }] });
  assert.equal(result.requests[0].title.includes('<'), false);
  assert.equal(result.requests[0].description.includes('<'), false);
  assert.deepEqual(result.requests[0].tags, ['study', 'math']);
});

test('rejects oversized collections', () => {
  assert.throws(() => normalizeSnapshot({ offers: Array.from({ length: 251 }, () => ({})) }), /no more than 250/);
});

test('writes and reads snapshots from disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridgeup-'));
  const file = path.join(dir, 'community.json');
  try {
    const store = createStore(file);
    const saved = store.write({ requests: [{ id: 'r-test', title: 'Garden help', tags: ['garden'] }] });
    assert.equal(saved.requests[0].title, 'Garden help');
    assert.equal(store.read().requests[0].id, 'r-test');
    assert.equal((fs.statSync(file).mode & 0o777), 0o600);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('preserves existing collections when a partial snapshot is sent', () => {
  const result = normalizeSnapshot({ requests: [{ id: 'r1', title: 'Help' }] }, { offers: [{ id: 'o1' }], events: [] });
  assert.equal(result.offers[0].id, 'o1');
});
