import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('post-install creates a private disabled-by-default component configuration', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-weixin-install-'));
  try {
    const result = spawnSync(process.execPath, [new URL('../hooks/post-install.js', import.meta.url).pathname], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const data = path.join(home, 'yos', 'components', 'weixin');
    const config = path.join(data, 'config.json');
    assert.equal(fs.statSync(data).mode & 0o777, 0o700);
    assert.equal(fs.statSync(config).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(fs.readFileSync(config, 'utf8')), {
      enabled: true,
      botAgent: 'YOS/0.1.0-alpha.1',
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
