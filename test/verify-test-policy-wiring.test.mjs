import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_STEPS,
  DEFAULT_TEST_SUITES,
  runVerification,
  verifyRecordedTestCounts,
} from '../scripts/verify.mjs';

test('channel verification runs every root repository test', () => {
  assert.equal(DEFAULT_TEST_SUITES[0].id, 'repository');
  assert.deepEqual(DEFAULT_TEST_SUITES[0].args, ['test']);
});

test('channel verification counts Weixin tests and runs its package gate independently', () => {
  assert.deepEqual(DEFAULT_TEST_SUITES.map(({ id }) => id), ['repository', 'feishu', 'weixin']);
  const packageStep = DEFAULT_STEPS.find(([label]) => label === 'Weixin package contract');
  assert.ok(packageStep, 'missing independent Weixin package step');
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => {},
    testSuites: [],
    testBaselines: {},
    steps: [packageStep],
  }), true);
});

test('channel verification runs the test policy before repository steps and fails closed', () => {
  const calls = [];
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => calls.push('policy'),
    verifyRecordedTestCountsImpl: (counts) => {
      calls.push('counts');
      return counts;
    },
    testSuites: [{ id: 'repository', label: 'fixture tests', command: process.execPath, args: ['-e', 'process.stdout.write("# tests 18\\n# pass 18\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0\\n")'] }],
    testBaselines: { repository: { minimumPassed: 18 } },
    steps: [['fixture', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: (label) => calls.push(label),
  }), true);
  assert.deepEqual(calls, ['policy', 'fixture tests', 'counts', 'fixture']);

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

test('channel verification rejects invalid recorded counts before package steps', () => {
  for (const invalidCounts of [true, {}, undefined]) {
    const calls = [];
    assert.equal(runVerification({
      verifyTestPolicyImpl: () => calls.push('policy'),
      executeTestGateImpl: () => {
        calls.push('gate');
        return invalidCounts;
      },
      verifyRecordedTestCountsImpl: (counts, testSuites, testBaselines) => {
        calls.push('counts');
        return verifyRecordedTestCounts(counts, testSuites, testBaselines);
      },
      testSuites: [{ id: 'repository', label: 'fixture tests' }],
      testBaselines: { repository: { minimumPassed: 18 } },
      steps: [['package', process.execPath, ['-e', 'process.exit(0)']]],
      onStep: (label) => calls.push(label),
    }), false);
    assert.deepEqual(calls, ['policy', 'gate', 'counts']);
  }
});

test('channel verification fails when the executed-test gate throws', () => {
  const calls = [];
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => calls.push('policy'),
    executeTestGateImpl: () => {
      calls.push('throwing-test-gate');
      throw new Error('test counts skipped');
    },
    testSuites: [],
    testBaselines: {},
    steps: [['package', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: (label) => calls.push(label),
  }), false);
  assert.deepEqual(calls, ['policy', 'throwing-test-gate']);
});

test('channel verification rejects a swallowed executed-test failure that returns true', () => {
  const calls = [];
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => calls.push('policy'),
    executeTestGateImpl: () => {
      calls.push('swallowed-test-gate');
      try {
        throw new Error('repository tests failed');
      } catch {
        return true;
      }
    },
    verifyRecordedTestCountsImpl: (counts, testSuites, testBaselines) => {
      calls.push('counts');
      return verifyRecordedTestCounts(counts, testSuites, testBaselines);
    },
    testSuites: [{ id: 'repository', label: 'fixture tests' }],
    testBaselines: { repository: { minimumPassed: 18 } },
    steps: [['package', process.execPath, ['-e', 'process.exit(0)']]],
    onStep: (label) => calls.push(label),
  }), false);
  assert.deepEqual(calls, ['policy', 'swallowed-test-gate', 'counts']);
});

test('channel verification reports a package-step spawn failure without throwing', () => {
  assert.equal(runVerification({
    verifyTestPolicyImpl: () => {},
    testSuites: [],
    testBaselines: {},
    steps: [['missing package step', '/definitely/missing/yos-command', []]],
  }), false);
});
