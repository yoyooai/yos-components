import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyTestPolicy } from './test-policy.mjs';
import { loadApprovedTestBaselines, verifyTapResult } from './test-baseline-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_TEST_SUITES = [
  { id: 'repository', label: 'repository tests', command: 'npm', args: ['test'], cwd: '.' },
  { id: 'feishu', label: 'Feishu tests', command: 'npm', args: ['test'], cwd: 'channels/001_feishu' },
  { id: 'weixin', label: 'Weixin tests', command: 'npm', args: ['test'], cwd: 'channels/002_weixin' },
];

export const DEFAULT_STEPS = [
  ['Feishu audit', 'npm', [
    'audit',
    '--prefix',
    'channels/001_feishu',
    '--audit-level=low',
    '--registry=https://registry.npmjs.org',
  ]],
  ['Feishu package contract', process.execPath, ['scripts/verify-package.mjs']],
  ['Weixin audit', 'npm', [
    'audit', '--prefix', 'channels/002_weixin', '--audit-level=low',
    '--registry=https://registry.npmjs.org',
  ]],
  ['Weixin package contract', process.execPath, ['scripts/verify-weixin-package.mjs']],
];

export function runTestSuites({ root, testSuites, testBaselines, onStep = () => {} }) {
  const counts = {};
  for (const suite of testSuites) {
    const baseline = testBaselines[suite.id];
    if (!baseline) throw new Error(`missing test baseline: ${suite.id}`);
    onStep(suite.label);
    console.log(`\n[verify] ${suite.label}`);
    const result = spawnSync(suite.command, suite.args, {
      cwd: path.resolve(root, suite.cwd || '.'),
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.error || result.status !== 0) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      if (result.error) throw result.error;
      throw new Error(`${suite.label} exited with status ${result.status}`);
    }
    const passed = verifyTapResult(`${result.stdout || ''}\n${result.stderr || ''}`, baseline, suite.label);
    counts[suite.id] = passed;
    console.log(`[verify] ${suite.label}: ${passed} passed`);
  }
  return counts;
}

export function verifyRecordedTestCounts(counts, testSuites, testBaselines) {
  for (const suite of testSuites) {
    const minimum = testBaselines[suite.id]?.minimumPassed;
    const passed = counts?.[suite.id];
    if (!Number.isInteger(passed) || !Number.isInteger(minimum) || passed < minimum) {
      throw new Error(`${suite.label} executed-test count is missing or below approved minimum ${minimum}`);
    }
  }
  return counts;
}

export function executeTestGate({
  root,
  testSuites,
  testBaselines,
  onStep,
  runTestSuitesImpl,
}) {
  return runTestSuitesImpl({
    root,
    testSuites,
    testBaselines,
    onStep,
  });
}

export function runVerification({
  root = ROOT,
  testSuites = DEFAULT_TEST_SUITES,
  testBaselines,
  steps = DEFAULT_STEPS,
  verifyTestPolicyImpl = verifyTestPolicy,
  runTestSuitesImpl = runTestSuites,
  verifyRecordedTestCountsImpl = verifyRecordedTestCounts,
  executeTestGateImpl = executeTestGate,
  onStep = () => {},
} = {}) {
  let failed = false;
  let approvedBaselines = null;
  let counts = null;
  let stepsPassed = false;
  try {
    verifyTestPolicyImpl({ root });
    approvedBaselines = testBaselines ?? loadApprovedTestBaselines(path.join(root, 'scripts', 'test-baselines.json'));
    counts = executeTestGateImpl({
      root,
      testSuites,
      testBaselines: approvedBaselines,
      onStep,
      runTestSuitesImpl,
    });
  } catch (error) {
    failed = true;
    console.error(`[verify] ${error.message}`);
  }

  if (!failed) {
    try {
      verifyRecordedTestCountsImpl(counts, testSuites, approvedBaselines);
    } catch (error) {
      failed = true;
      console.error(`[verify] ${error.message}`);
    }
  }

  if (!failed) {
    try {
      stepsPassed = true;
      for (const [label, command, args] of steps) {
        onStep(label);
        console.log(`\n[verify] ${label}`);
        const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status !== 0) {
          stepsPassed = false;
          break;
        }
      }
    } catch (error) {
      failed = true;
      stepsPassed = false;
      console.error(`[verify] ${error.message}`);
    }
  }
  return !failed && stepsPassed;
}

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
if (invokedPath === fs.realpathSync(fileURLToPath(import.meta.url))) {
  if (!runVerification()) process.exit(1);
}
