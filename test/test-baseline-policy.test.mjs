import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadApprovedTestBaselines,
  parseTapSummary,
  verifyTapResult,
} from '../scripts/test-baseline-policy.mjs';

function digest(baselines) {
  return crypto.createHash('sha256').update(JSON.stringify(baselines)).digest('hex');
}

const HEALTHY = '# tests 29\n# pass 29\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('channel baseline changes require a matching approval digest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-channel-baselines-'));
  const file = path.join(root, 'baselines.json');
  const baselines = {
    repository: { minimumPassed: 18 },
    feishu: { minimumPassed: 29 },
  };
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    baselines,
    approvedDigest: digest({ ...baselines, repository: { minimumPassed: 1 } }),
  }));
  assert.throws(() => loadApprovedTestBaselines(file), /approval digest mismatch/);
  fs.writeFileSync(file, JSON.stringify({ version: 1, baselines, approvedDigest: digest(baselines) }));
  assert.deepEqual(loadApprovedTestBaselines(file), baselines);
  fs.rmSync(root, { recursive: true, force: true });
});

test('channel TAP parsing uses the actual passed count', () => {
  assert.deepEqual(parseTapSummary(HEALTHY), {
    tests: 29,
    passed: 29,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  });
});

test('channel baselines reject low pass counts even when total remains high', () => {
  const filtered = HEALTHY.replace('# pass 29', '# pass 12');
  assert.throws(() => verifyTapResult(filtered, { minimumPassed: 29 }, 'Feishu'), /passed 12.*minimum 29/);
});

test('channel baselines reject skipped, cancelled, and todo results', () => {
  assert.throws(() => verifyTapResult(HEALTHY.replace('# skipped 0', '# skipped 1'), { minimumPassed: 29 }, 'Feishu'), /skipped 1/);
  assert.throws(() => verifyTapResult(HEALTHY.replace('# cancelled 0', '# cancelled 1'), { minimumPassed: 29 }, 'Feishu'), /cancelled 1/);
  assert.throws(() => verifyTapResult(HEALTHY.replace('# todo 0', '# todo 1'), { minimumPassed: 29 }, 'Feishu'), /todo 1/);
});

test('channel TAP parsing fails closed when a summary field is absent', () => {
  assert.throws(() => parseTapSummary('# tests 29\n# pass 29\n'), /missing TAP summary field/);
});
