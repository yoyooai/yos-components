import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isCompatibleCoreVersion } from '../hooks/post-install-shared.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('YOS Core compatibility accepts the supported alpha line and rejects other lines', () => {
  for (const version of ['0.1.0-alpha.1', '0.1.0-alpha.2', '0.1.0', '0.1.7']) {
    assert.equal(isCompatibleCoreVersion(version), true, version);
  }
  for (const version of ['0.1.0-alpha.0', '0.0.9', '0.2.0', '1.0.0', 'garbage']) {
    assert.equal(isCompatibleCoreVersion(version), false, version);
  }
});

test('C4 delivery carries the original Feishu message ID as the idempotency key', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'index.js'), 'utf8');
  assert.match(source, /function sendToC4\(source, endpoint, messageId, content, onReject\)/);
  assert.match(source, /'--message-id', messageId/);
  assert.doesNotMatch(source, /sendToC4\('feishu', endpoint, msg, /);
});

test('saved configuration is private to the YOS account', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-config-'));
  const dataDir = path.join(home, 'yos', 'components', 'feishu');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const moduleUrl = pathToFileURL(path.join(ROOT, 'src', 'lib', 'config.js'));
    moduleUrl.searchParams.set('test', `${Date.now()}-${Math.random()}`);
    const { CONFIG_PATH, saveConfig } = await import(moduleUrl.href);
    assert.equal(saveConfig({ enabled: true }), true);
    assert.equal(fs.statSync(CONFIG_PATH).mode & 0o777, 0o600);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
