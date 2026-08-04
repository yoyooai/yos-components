import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'channels', '001_feishu');

test('Feishu runtime tightens an existing data directory to mode 0700', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-runtime-mode-'));
  const home = path.join(temporaryRoot, 'home');
  const dataDir = path.join(home, 'yos', 'components', 'feishu');

  try {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
    fs.chmodSync(dataDir, 0o755);
    fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ enabled: false }), { mode: 0o600 });

    const result = spawnSync(process.execPath, [path.join(COMPONENT, 'src', 'index.js')], {
      cwd: COMPONENT,
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
      timeout: 10_000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
