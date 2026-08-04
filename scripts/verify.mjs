import { spawnSync } from 'node:child_process';

const steps = [
  ['repository tests', process.execPath, ['--test', 'test/repository-contract.test.mjs']],
  ['Feishu tests', 'npm', ['test', '--prefix', 'channels/001_feishu']],
  ['Feishu audit', 'npm', ['audit', '--prefix', 'channels/001_feishu', '--audit-level=high']],
  ['Feishu package contract', process.execPath, ['scripts/verify-package.mjs']],
];

for (const [label, command, args] of steps) {
  console.log(`\n[verify] ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
