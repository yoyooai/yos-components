import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_STEPS } from '../scripts/verify.mjs';

test('repository verification runs the released-version immutability gate', () => {
  const step = DEFAULT_STEPS.find(([label]) => label === 'Released version immutability');
  assert.ok(step, 'released-version immutability gate is not wired into npm run verify');
  assert.deepEqual(step.slice(1), [process.execPath, ['scripts/release-version-policy.mjs']]);
});
