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

test('the Feishu candidate satisfies the complete channel test policy', () => {
  assert.doesNotThrow(() => verifyTestPolicy({ root: ROOT }));
});

test('channel policy fails closed when its scan root is missing', () => {
  const missing = path.join(os.tmpdir(), `yos-channels-missing-${Date.now()}`);
  assert.throws(() => verifyTestPolicy({ root: missing }), /scan root is missing/);
});

test('the channel policy protects its guard and Feishu safety tests', () => {
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
    'const countsVerified = executeTestGateImpl({',
    'if (!countsVerified) {',
    'for (const [label, command, args] of steps) {',
  ].join('\n');
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'const countsVerified = executeTestGateImpl({',
    'false && runTestSuitesImpl({',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /executed-test gate is missing/,
  );
  fs.writeFileSync(path.join(scripts, 'verify.mjs'), healthy.replace(
    'const countsVerified = executeTestGateImpl({',
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
    'if (!countsVerified) {',
    'if (false && !countsVerified) {',
  ));
  assert.throws(
    () => verifyTestBaselineGuard(root),
    /verification result is not enforced/,
  );
  fs.rmSync(root, { recursive: true, force: true });
});
