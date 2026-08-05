import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  findDisabledTests,
  verifyCriticalTestFiles,
  verifyTestBaselineGuard,
  verifyTestPolicy,
} from '../scripts/test-policy.mjs';

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

test('the channel candidates satisfy the complete test policy', () => {
  assert.doesNotThrow(() => verifyTestPolicy({ root: ROOT }));
});

test('channel policy fails closed when its scan root is missing', () => {
  const missing = path.join(os.tmpdir(), `yos-channels-missing-${Date.now()}`);
  assert.throws(() => verifyTestPolicy({ root: missing }), /scan root is missing/);
});

test('the channel policy protects its guard and channel safety tests', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'critical-test-files.json'), 'utf8'));
  const paths = manifest.files.map((entry) => entry.path);
  for (const expected of [
    'test/test-policy.test.mjs',
    'test/test-baseline-policy.test.mjs',
    'test/verify-test-policy-wiring.test.mjs',
    'test/repository-contract.test.mjs',
    'test/runtime-permissions.test.mjs',
    'test/feishu-package-policy.test.mjs',
    'scripts/test-policy.mjs',
    'scripts/test-baseline-policy.mjs',
    'scripts/test-baselines.json',
    'scripts/critical-test-files.json',
    'scripts/verify.mjs',
    'scripts/verify-package.mjs',
  ]) assert.ok(paths.includes(expected), expected);
  for (const expected of [
    'test/weixin-repository-contract.test.mjs',
    'channels/002_weixin/test/protocol.test.ts',
    'scripts/verify-weixin-package.mjs',
    'channels/002_weixin/provenance/upstream.json',
  ]) assert.ok(paths.includes(expected), expected);
  assert.doesNotThrow(() => verifyCriticalTestFiles(ROOT, manifest));
});

test('the channel policy rejects a disabled, wrapped, or misplaced executed-test data gate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-channel-wiring-'));
  const scripts = path.join(root, 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  const baselines = {
    repository: { minimumPassed: 18 },
    feishu: { minimumPassed: 29 },
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(baselines)).digest('hex');
  fs.writeFileSync(path.join(scripts, 'test-baselines.json'), JSON.stringify({
    version: 1,
    baselines,
    approvedDigest: digest,
  }));
  const healthy = [
    'export function runVerification({',
    'let failed = false;',
    'return runTestSuitesImpl({',
    'let counts = null;',
    'let stepsPassed = false;',
    'try {',
    'counts = executeTestGateImpl({',
    '} catch (error) {',
    'verifyRecordedTestCountsImpl(counts, testSuites, approvedBaselines);',
    'for (const [label, command, args] of steps) {',
    'return stepsPassed;',
  ].join('\n');
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy);
  assert.doesNotThrow(() => verifyTestBaselineGuard(root));

  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'return runTestSuitesImpl({',
    'const counts = runTestSuitesImpl({',
  ).replace(
    'verifyRecordedTestCountsImpl(counts, testSuites, approvedBaselines);',
    'return verifyRecordedTestCountsImpl(counts, testSuites, testBaselines) === counts;',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /executed-test gate must return raw counts/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'counts = executeTestGateImpl({',
    'try { executeTestGateImpl({',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /executed-test gate is missing/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'verifyRecordedTestCountsImpl(counts, testSuites, approvedBaselines);',
    '',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /executed-test count validator is missing/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    '} catch (error) {\nverifyRecordedTestCountsImpl(counts, testSuites, approvedBaselines);',
    'verifyRecordedTestCountsImpl(counts, testSuites, approvedBaselines);\n} catch (error) {',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /must be enforced after the verification catch block/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'let counts = null;\nlet stepsPassed = false;\ntry {',
    'try {\nlet counts = null;\nlet stepsPassed = false;',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /declared before the verification try block/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'verifyRecordedTestCountsImpl(counts, testSuites, approvedBaselines);',
    '',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /executed-test count validator is missing/,
  );
  fs.rmSync(root, { recursive: true, force: true });
});
