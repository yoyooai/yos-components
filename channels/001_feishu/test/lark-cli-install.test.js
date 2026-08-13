import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import {
  EXPECTED_LARK_CLI_SUB_SKILLS,
  findMissingLarkCliSkills,
  installLarkCliBinary,
  installLarkCliSkills,
  runProcessGroup,
} from '../hooks/post-install-shared.js';

const COMPONENT_ROOT = path.resolve(import.meta.dirname, '..');

function makeSkillDir(present = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-lark-skills-'));
  for (const name of present) {
    const dir = path.join(root, 'references', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`);
  }
  return root;
}

function makeVendorRoot(version = '1.0.81', present = EXPECTED_LARK_CLI_SUB_SKILLS) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-lark-vendor-'));
  fs.writeFileSync(path.join(root, 'source.json'), `${JSON.stringify({ tag: `v${version}` })}\n`);
  for (const name of present) {
    const dir = path.join(root, 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`);
  }
  return root;
}

test('detects a partial 27-sub-skill installation even at the current component version', () => {
  const skillDir = makeSkillDir(EXPECTED_LARK_CLI_SUB_SKILLS.slice(0, -1));
  assert.deepEqual(findMissingLarkCliSkills(skillDir), [EXPECTED_LARK_CLI_SUB_SKILLS.at(-1)]);
});

test('retries the GitHub sub-skill fetch and verifies all files before succeeding', async () => {
  const skillDir = makeSkillDir();
  let attempts = 0;
  await installLarkCliSkills(skillDir, {
    target: '1.0.81',
    vendorRoot: makeVendorRoot('1.0.81', []),
    sleep: () => {},
    run: (command, args) => {
      attempts += 1;
      assert.equal(command, 'npx');
      assert.ok(args.indexOf('--yes') < args.indexOf('xc-skills@latest'));
      if (attempts < 3) throw new Error('temporary GitHub failure');
      for (const name of EXPECTED_LARK_CLI_SUB_SKILLS) {
        const dir = path.join(skillDir, 'references', name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'), '# repaired\n');
      }
    },
  });
  // This assertion intentionally exercises the production default. Passing a
  // maxAttempts fixture here would let DEFAULT_FETCH_ATTEMPTS regress silently.
  assert.equal(attempts, 3);
  assert.deepEqual(findMissingLarkCliSkills(skillDir), []);
});

test('reports GitHub asset fetch failure with an actionable retry command', async () => {
  const skillDir = makeSkillDir();
  await assert.rejects(() => installLarkCliSkills(skillDir, {
    target: '1.0.81',
    vendorRoot: makeVendorRoot('1.0.81', []),
    maxAttempts: 2,
    sleep: () => {},
    run: () => { throw new Error('network down'); },
  }), (error) => {
    assert.equal(error.code, 'feishu_subskills_fetch_failed');
    assert.equal(error.stage, 'github_asset_fetch');
    assert.match(error.message, /GitHub/);
    assert.match(error.remediation, /yos upgrade feishu/);
    return true;
  });
});

test('waits for the network writer to finish before checking for missing skills', async () => {
  const skillDir = makeSkillDir();
  await installLarkCliSkills(skillDir, {
    target: '1.0.81',
    maxAttempts: 1,
    vendorRoot: makeVendorRoot('1.0.81', []),
    run: async () => {
      await delay(20);
      for (const name of EXPECTED_LARK_CLI_SUB_SKILLS) {
        const dir = path.join(skillDir, 'references', name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'), '# complete\n');
      }
    },
  });
  assert.deepEqual(findMissingLarkCliSkills(skillDir), []);
});

test('installs all sub-skills from the vendored copy without touching the network', async () => {
  const skillDir = makeSkillDir();
  let networkCalls = 0;
  await installLarkCliSkills(skillDir, {
    target: '1.0.81',
    vendorRoot: makeVendorRoot(),
    run: () => { networkCalls += 1; },
  });
  assert.equal(networkCalls, 0);
  assert.deepEqual(findMissingLarkCliSkills(skillDir), []);
  assert.equal(
    fs.readFileSync(path.join(skillDir, 'references', '.lark-cli-version'), 'utf8'),
    '1.0.81\n',
  );
});

test('rejects a vendored sub-skill version that differs from package larkCli.version', async () => {
  await assert.rejects(
    () => installLarkCliSkills(makeSkillDir(), {
      target: '1.0.81',
      vendorRoot: makeVendorRoot('1.0.80'),
      run: () => assert.fail('version mismatch must fail before network fallback'),
    }),
    /vendor tag v1\.0\.80 does not match target v1\.0\.81/,
  );
});

test('the packaged vendor manifest matches package larkCli.version and all 27 skills', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(COMPONENT_ROOT, 'package.json'), 'utf8'));
  const vendorRoot = path.join(COMPONENT_ROOT, 'vendor', 'lark-cli-skills');
  const source = JSON.parse(fs.readFileSync(path.join(vendorRoot, 'source.json'), 'utf8'));
  assert.equal(source.tag, `v${pkg.larkCli.version}`);
  assert.equal(source.versionSource, '../../package.json#larkCli.version');
  assert.equal(Object.hasOwn(source, 'version'), false);
  assert.equal(source.license, 'MIT');
  assert.match(source.archiveSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(source.normalizations, [{
    path: 'skills/lark-apps/references/lark-apps-db-execute.md',
    change: 'Replaced the illustrative /Users/... path with /Users/example-user for package hygiene.',
  }]);
  assert.deepEqual(
    EXPECTED_LARK_CLI_SUB_SKILLS.filter(
      (name) => !fs.existsSync(path.join(vendorRoot, 'skills', name, 'SKILL.md'))
    ),
    [],
  );
});

test('times out by signalling the entire detached process group', async () => {
  const child = new EventEmitter();
  child.pid = 4321;
  const signals = [];
  const operation = runProcessGroup('fake-command', [], {
    timeout: 5,
    gracePeriod: 5,
    spawn: () => child,
    kill: (pid, signal) => {
      signals.push([pid, signal]);
      if (signal === 'SIGKILL') child.emit('close', null, 'SIGKILL');
    },
  });
  await assert.rejects(operation, /timed out/);
  assert.deepEqual(signals, [
    [-4321, 'SIGTERM'],
    [-4321, 'SIGKILL'],
  ]);
});

test('stops a stubborn descendant from writing after a timeout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-process-tree-'));
  const counter = path.join(root, 'counter.txt');
  const descendant = [
    "const fs = require('node:fs')",
    "process.on('SIGTERM', () => {})",
    `setInterval(() => fs.appendFileSync(${JSON.stringify(counter)}, 'x'), 10)`,
  ].join(';');
  const parent = [
    "const { spawn } = require('node:child_process')",
    `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' })`,
    'setInterval(() => {}, 1000)',
  ].join(';');

  await assert.rejects(
    runProcessGroup(process.execPath, ['-e', parent], {
      timeout: 120,
      gracePeriod: 80,
      stdio: 'ignore',
    }),
    /timed out/,
  );
  const stoppedAt = fs.existsSync(counter) ? fs.statSync(counter).size : 0;
  assert.ok(stoppedAt > 0, 'the descendant must be alive before timeout cleanup');
  await delay(180);
  assert.equal(fs.statSync(counter).size, stoppedAt);
});

test('does not resolve while a successful command leaves a descendant writing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-success-tree-'));
  const counter = path.join(root, 'counter.txt');
  const descendant = [
    "const fs = require('node:fs')",
    "process.on('SIGTERM', () => {})",
    `setInterval(() => fs.appendFileSync(${JSON.stringify(counter)}, 'x'), 10)`,
  ].join(';');
  const parent = [
    "const { spawn } = require('node:child_process')",
    `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore' }).unref()`,
    'setTimeout(() => {}, 80)',
  ].join(';');

  await runProcessGroup(process.execPath, ['-e', parent], {
    timeout: 2_000,
    gracePeriod: 80,
    stdio: 'ignore',
  });
  const stoppedAt = fs.existsSync(counter) ? fs.statSync(counter).size : 0;
  assert.ok(stoppedAt > 0, 'the descendant must write before successful cleanup resolves');
  await delay(180);
  assert.equal(fs.statSync(counter).size, stoppedAt);
});

test('reports npm global install failure separately from GitHub fetch failure', () => {
  assert.throws(() => installLarkCliBinary({
    target: '1.0.81',
    getInstalledVersion: () => null,
    commandExists: () => false,
    run: (command, args, options) => {
      assert.equal(command, 'npm');
      assert.deepEqual(args, ['install', '-g', '@larksuite/cli@1.0.81']);
      assert.equal(options.timeout, 180_000);
      throw new Error('EACCES');
    },
  }), (error) => {
    assert.equal(error.code, 'feishu_lark_cli_npm_install_failed');
    assert.equal(error.stage, 'npm_global_install');
    assert.match(error.message, /npm/);
    assert.match(error.remediation, /npm config get prefix/);
    return true;
  });
});

test('every lifecycle hook waits for the same integrity repair implementation', () => {
  const skill = fs.readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /repair:\s+hooks\/repair\.js/);

  for (const hook of ['post-install.js', 'post-upgrade.js', 'repair.js']) {
    const source = fs.readFileSync(new URL(`../hooks/${hook}`, import.meta.url), 'utf8');
    assert.match(source, /await installLarkCliSkills\(SKILL_DIR\)/, hook);
  }

  const repair = fs.readFileSync(new URL('../hooks/repair.js', import.meta.url), 'utf8');
  assert.match(repair, /process\.exitCode\s*=\s*1/);
});
