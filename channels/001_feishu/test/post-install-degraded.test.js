import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, '..', 'hooks', 'post-install.js');

/**
 * Run the real hook with the lark-cli add-on made impossible to install.
 *
 * `yos` is stubbed (the hook aborts early without a readable core version) and
 * PATH is emptied of npm/npx, so `installLarkCliBinary()` fails the way a
 * machine that cannot reach the registry fails.
 */
function runHookWithLarkCliUnavailable() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feishu-degraded-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });

  const yosStub = path.join(bin, 'yos');
  fs.writeFileSync(yosStub, '#!/bin/sh\necho 0.1.15\n', { mode: 0o755 });

  const result = spawnSync(process.execPath, [HOOK], {
    encoding: 'utf8',
    env: {
      HOME: home,
      // Only the stub is reachable: npm and npx are deliberately absent.
      PATH: bin,
      YOS_ASSUME_YES: '1',
    },
  });

  return { ...result, home };
}

describe('post-install hook when an optional add-on cannot be installed', () => {
  const run = runHookWithLarkCliUnavailable();
  const output = `${run.stdout || ''}${run.stderr || ''}`;

  // The defect: with zero sub-skills fetched the hook still ended on
  // "[post-install] Complete!" and exit code 0, so `yos add` printed a green
  // check over a component that was only partly installed.
  it('does not claim completion', () => {
    assert.ok(
      !output.includes('[post-install] Complete!'),
      `hook still claimed completion:\n${output}`,
    );
  });

  it('says what is unavailable', () => {
    assert.match(output, /reduced functionality/i);
  });

  it('ends non-zero so the installer can tell success from degradation', () => {
    assert.notEqual(run.status, 0, 'a degraded setup must not exit 0');
  });

  // Signalling the failure must not cost the user the instructions they need:
  // the remaining-steps guide is printed before the exit code is set.
  it('still prints the remaining setup steps', () => {
    assert.match(output, /Feishu \(飞书\) Setup — Remaining Steps/);
    assert.match(output, /im\.message\.receive_v1/);
  });

  it('still creates the component data directory and config', () => {
    const dataDir = path.join(run.home, 'yos', 'components', 'feishu');
    assert.ok(fs.existsSync(path.join(dataDir, 'config.json')), 'config.json should still be written');
    assert.ok(fs.existsSync(path.join(dataDir, 'logs')), 'logs/ should still be created');
  });
});
