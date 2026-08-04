import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'channels', '002_weixin');
const ECOSYSTEM = path.join(COMPONENT, 'ecosystem.config.cjs');

function locatePm2() {
  const result = spawnSync('/bin/sh', ['-lc', 'command -v pm2'], { encoding: 'utf8' });
  assert.equal(result.status, 0, 'PM2 is required for the Weixin runtime acceptance test');
  return result.stdout.trim();
}

function runPm2(pm2, args, env) {
  return spawnSync(pm2, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 20_000,
  });
}

test('Weixin stays online under PM2 with Node and no Bun in PATH', async () => {
  const pm2 = locatePm2();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-weixin-pm2-'));
  const home = path.join(root, 'home');
  const skillParent = path.join(home, 'yos', '.claude', 'skills');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(skillParent, { recursive: true });
  fs.mkdirSync(dataDir, { mode: 0o755 });
  fs.symlinkSync(COMPONENT, path.join(skillParent, 'weixin'), 'dir');

  const env = {
    ...process.env,
    HOME: home,
    PM2_HOME: path.join(root, 'pm2'),
    YOS_WEIXIN_DATA_DIR: dataDir,
    PATH: [...new Set([path.dirname(pm2), path.dirname(process.execPath), '/usr/bin', '/bin'])].join(':'),
  };

  try {
    const started = runPm2(pm2, ['start', ECOSYSTEM, '--only', 'yos-weixin', '--silent'], env);
    assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const listed = runPm2(pm2, ['jlist', '--silent'], env);
    assert.equal(listed.status, 0, listed.stderr);
    const processes = JSON.parse(listed.stdout);
    const service = processes.find((entry) => entry.name === 'yos-weixin');
    assert.ok(service, 'yos-weixin is missing from the isolated PM2 process list');
    assert.equal(service.pm2_env.status, 'online');
    assert.equal(service.pm2_env.exec_interpreter, 'node');
    assert.equal(service.pm2_env.restart_time, 0);
    assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700);
  } finally {
    runPm2(pm2, ['kill', '--silent'], env);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
