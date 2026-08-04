import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyTestPolicy } from './test-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_STEPS = [
  ['repository tests', 'npm', ['test']],
  ['Feishu tests', 'npm', ['test', '--prefix', 'channels/001_feishu']],
  ['Feishu audit', 'npm', [
    'audit',
    '--prefix',
    'channels/001_feishu',
    '--audit-level=low',
    '--registry=https://registry.npmjs.org',
  ]],
  ['Feishu package contract', process.execPath, ['scripts/verify-package.mjs']],
];

export function runVerification({
  root = ROOT,
  steps = DEFAULT_STEPS,
  verifyTestPolicyImpl = verifyTestPolicy,
  onStep = () => {},
} = {}) {
  try {
    verifyTestPolicyImpl({ root });
    for (const [label, command, args] of steps) {
      onStep(label);
      console.log(`\n[verify] ${label}`);
      const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) return false;
    }
    return true;
  } catch (error) {
    console.error(`[verify] ${error.message}`);
    return false;
  }
}

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
if (invokedPath === fs.realpathSync(fileURLToPath(import.meta.url))) {
  if (!runVerification()) process.exit(1);
}
