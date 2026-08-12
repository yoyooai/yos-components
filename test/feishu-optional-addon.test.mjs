/**
 * lark-cli is an optional add-on. Its failure must not cost the user the setup
 * steps printed after it.
 *
 * Observed on 2026-08-05: `npm install -g @larksuite/cli` failed on a customer
 * machine, the post-install hook called process.exit(1) on the spot, and
 * everything below it — the developer-console steps the user actually has to
 * follow, and the webhook URL — was never printed. The messaging channel, which
 * needs none of it, was fine the whole time.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(ROOT, 'channels', '001_feishu', 'hooks', 'post-install.js');
const hookSource = fs.readFileSync(HOOK, 'utf8');

test('a failed lark-cli install does not end the hook', () => {
  const larkBlock = hookSource.slice(
    hookSource.indexOf('// 5. lark-cli integration'),
    hookSource.indexOf('[post-install] Complete!'),
  );
  assert.ok(larkBlock.length > 0, 'the lark-cli block moved — re-anchor this test');
  assert.doesNotMatch(larkBlock, /process\.exit\(/,
    'an optional add-on must not exit the hook');
});

test('a failed lark-cli install names what is unavailable and how to retry', () => {
  const larkBlock = hookSource.slice(
    hookSource.indexOf('// 5. lark-cli integration'),
    hookSource.indexOf('[post-install] Complete!'),
  );
  assert.match(larkBlock, /channel itself is unaffected/);
  assert.match(larkBlock, /documents, sheets, Base, calendar/);
  assert.match(larkBlock, /yos upgrade feishu/);
});

test('the hook runs to completion when npm cannot install globally', () => {
  // The real behavior, with an npm that fails the way an unwritable global
  // directory fails. Everything after the add-on still has to be printed.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-addon-'));
  const binDir = path.join(home, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, 'npm'),
    '#!/bin/sh\nif [ "$1" = "install" ]; then echo "npm error EACCES: permission denied" >&2; exit 243; fi\nexec /usr/bin/env npm "$@"\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(binDir, 'yos'),
    '#!/bin/sh\necho 0.1.0\n',
    { mode: 0o755 },
  );

  const dataDir = path.join(home, 'yos', 'components', 'feishu');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(home, 'yos', '.yos'), { recursive: true });
  fs.writeFileSync(path.join(home, 'yos', '.env'), '');

  try {
    const result = spawnSync(process.execPath, [HOOK], {
      cwd: path.join(ROOT, 'channels', '001_feishu'),
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        HOME: home,
        YOS_DIR: path.join(home, 'yos'),
        YOS_FEISHU_DATA_DIR: dataDir,
        PATH: `${binDir}:${process.env.PATH}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    assert.match(output, /channel itself is unaffected/,
      `the degradation notice was not printed:\n${output}`);

    // "Running to completion" is checked against the thing this test exists to
    // protect — the developer-console steps and the webhook URL printed after
    // the add-on — rather than against the word "Complete!".
    //
    // 2026-08-13 (TD-149): that word is no longer printed on this path. Saying
    // "Complete!" after fetching none of the sub-skills is what let `yos add`
    // stamp a green check on a half-installed component. The hook now names the
    // degradation and ends non-zero. It still runs to the end, which is what
    // the 2026-08-05 defect was about, and that is asserted directly below.
    assert.match(output, /Feishu \(飞书\) Setup — Remaining Steps/,
      `the hook stopped at the optional add-on:\n${output}`);
    assert.match(output, /im\.message\.receive_v1/,
      `the setup steps were cut short:\n${output}`);
    assert.match(output, /reduced functionality/,
      `a degraded run must not read as a clean one:\n${output}`);
    assert.notEqual(result.status, 0,
      'a degraded run must be distinguishable from a clean one by exit code');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
