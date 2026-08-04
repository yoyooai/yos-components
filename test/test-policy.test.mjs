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

test('the channel policy rejects a disabled, wrapped, or unvalidated executed-test gate', () => {
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
    'const counts = runTestSuitesImpl({',
    'return verifyRecordedTestCountsImpl(counts, testSuites, testBaselines) === counts;',
    'export function runVerification({',
    'let countsVerified = false;',
    'let stepsPassed = false;',
    'try {',
    'countsVerified = executeTestGateImpl({',
    'for (const [label, command, args] of steps) {',
    '} catch (error) {',
    'if (!failed && !countsVerified) {',
    'return stepsPassed;',
  ].join('\n');
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'countsVerified = executeTestGateImpl({',
    'false && runTestSuitesImpl({',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /executed-test gate is missing/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'countsVerified = executeTestGateImpl({',
    'try { executeTestGateImpl({',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /executed-test gate is missing/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'return verifyRecordedTestCountsImpl(counts, testSuites, testBaselines) === counts;\n',
    '',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /executed-test count validator is missing/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'if (!failed && !countsVerified) {',
    'if (false && !failed && !countsVerified) {',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /verification result is not enforced/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'let countsVerified = false;\nlet stepsPassed = false;\ntry {',
    'try {\nlet countsVerified = false;\nlet stepsPassed = false;',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /declared before the verification try block/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    '} catch (error) {\nif (!failed && !countsVerified) {',
    'if (!failed && !countsVerified) {\n} catch (error) {',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /enforced after the verification catch block/,
  );
  fs.rmSync(root, { recursive: true, force: true });
});
