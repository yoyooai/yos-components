import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildHealthReport } from '../src/lib/health.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT = path.resolve(HERE, '..');

describe('Feishu doctor health identity', () => {
  test('reports the masked app, host and configured connection mode', () => {
    const report = buildHealthReport({
      appId: 'cli_aaad4f7312345abcdef',
      hostname: 'yos-nova',
      connectionMode: 'websocket',
    });

    assert.deepEqual(report, {
      status: 'ok',
      identity: { app: '…abcdef', host: 'yos-nova', mode: 'websocket' },
    });
    assert.doesNotMatch(JSON.stringify(report), /cli_aaad4f7312345abcdef/);
  });

  test('marks unknown local configuration honestly instead of inventing identity', () => {
    const report = buildHealthReport({ appId: '', hostname: 'host-a', connectionMode: '' });
    assert.deepEqual(report.identity, { app: '(unknown)', host: 'host-a', mode: 'websocket' });
  });

  test('declares the packaged health entrypoint in SKILL.md', () => {
    const skill = fs.readFileSync(path.join(COMPONENT, 'SKILL.md'), 'utf8');
    assert.match(skill, /health:\s+hooks\/health\.js/);
    assert.equal(fs.existsSync(path.join(COMPONENT, 'hooks', 'health.js')), true);
  });

  test('runs the packaged health entrypoint against local config without exposing the App ID', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-health-'));
    try {
      const dataDir = path.join(home, 'yos', 'components', 'feishu');
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(home, 'yos', '.env'), 'FEISHU_APP_ID=cli_aaad4f7312345abcdef\n');
      fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ connection_mode: 'webhook' }));

      const env = { ...process.env, HOME: home };
      delete env.FEISHU_APP_ID;
      delete env.FEISHU_APP_SECRET;
      const result = spawnSync(process.execPath, ['hooks/health.js'], {
        cwd: COMPONENT,
        env,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.identity.app, '…abcdef');
      assert.equal(report.identity.mode, 'webhook');
      assert.doesNotMatch(result.stdout, /cli_aaad4f7312345abcdef/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
