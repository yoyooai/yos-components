import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_STEPS, runVerification } from '../scripts/verify.mjs';

test('channel verification runs every root repository test', () => {
  assert.deepEqual(DEFAULT_STEPS[0], ['repository tests', 'npm', ['test']]);
});

test('channel verification runs the test policy before repository steps and fails closed', () => {
  const calls = [];
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => calls.push('policy'),
    steps: [['fixture', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: () => calls.push('step'),
  }), true);
  assert.deepEqual(calls, ['policy', 'step']);

  calls.length = 0;
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => {
      calls.push('policy');
      throw new Error('policy unavailable');
    },
    steps: [['fixture', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: () => calls.push('step'),
  }), false);
  assert.deepEqual(calls, ['policy']);
});
