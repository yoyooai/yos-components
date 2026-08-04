import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_TEST_SUITES, runVerification } from '../scripts/verify.mjs';

test('channel verification runs every root repository test', () => {
  assert.equal(DEFAULT_TEST_SUITES[0].id, 'repository');
  assert.deepEqual(DEFAULT_TEST_SUITES[0].args, ['test']);
});

test('channel verification runs the test policy before repository steps and fails closed', () => {
  const calls = [];
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => calls.push('policy'),
    testSuites: [{ id: 'repository', label: 'fixture tests', command: process.execPath, args: ['-e', 'process.stdout.write("# tests 18\\n# pass 18\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0\\n")'] }],
    testBaselines: { repository: { minimumPassed: 18 } },
    steps: [['fixture', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: (label) => calls.push(label),
  }), true);
  assert.deepEqual(calls, ['policy', 'fixture tests', 'fixture']);

  calls.length = 0;
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => {
      calls.push('policy');
      throw new Error('policy unavailable');
    },
    testSuites: [],
    testBaselines: {},
    steps: [['fixture', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: () => calls.push('step'),
  }), false);
  assert.deepEqual(calls, ['policy']);
});

test('channel verification fails before package steps when executed counts are low', () => {
  const calls = [];
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => calls.push('policy'),
    testSuites: [{ id: 'repository', label: 'fixture tests', command: process.execPath, args: ['-e', 'process.stdout.write("# tests 18\\n# pass 1\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0\\n")'] }],
    testBaselines: { repository: { minimumPassed: 18 } },
    steps: [['package', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: (label) => calls.push(label),
  }), false);
  assert.deepEqual(calls, ['policy', 'fixture tests']);
});

test('channel verification rejects a no-op test runner before package steps', () => {
  const calls = [];
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => calls.push('policy'),
    runTestSuitesImpl: () => {
      calls.push('tests');
      return undefined;
    },
    testSuites: [{ id: 'repository', label: 'fixture tests' }],
    testBaselines: { repository: { minimumPassed: 18 } },
    steps: [['package', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: (label) => calls.push(label),
  }), false);
  assert.deepEqual(calls, ['policy', 'tests']);
});
