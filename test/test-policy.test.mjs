import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { findDisabledTests, verifyTestPolicy } from '../scripts/test-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('channel policy finds disabled and focused test declarations', () => {
  const source = [
    "test.skip('one', () => {});",
    "describe.skip('two', () => {});",
    "xit('three', () => {});",
    "xdescribe('four', () => {});",
    "it.only('five', () => {});",
    "const example = \"test.skip('string')\";",
  ].join('\n');

  assert.deepEqual(
    findDisabledTests([{ path: 'test/example.test.mjs', source }]).map(({ line, kind }) => ({ line, kind })),
    [
      { line: 1, kind: 'test.skip' },
      { line: 2, kind: 'describe.skip' },
      { line: 3, kind: 'xit' },
      { line: 4, kind: 'xdescribe' },
      { line: 5, kind: 'it.only' },
    ],
  );
});

test('the Feishu candidate satisfies the complete channel test policy', () => {
  assert.doesNotThrow(() => verifyTestPolicy({ root: ROOT }));
});

test('channel policy fails closed when its scan root is missing', () => {
  const missing = path.join(os.tmpdir(), `yos-channels-missing-${Date.now()}`);
  assert.throws(() => verifyTestPolicy({ root: missing }), /scan root is missing/);
});
