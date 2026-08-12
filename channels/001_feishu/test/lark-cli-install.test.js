import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EXPECTED_LARK_CLI_SUB_SKILLS,
  findMissingLarkCliSkills,
  installLarkCliBinary,
  installLarkCliSkills,
} from '../hooks/post-install-shared.js';

function makeSkillDir(present = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-lark-skills-'));
  for (const name of present) {
    const dir = path.join(root, 'references', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`);
  }
  return root;
}

test('detects a partial 27-sub-skill installation even at the current component version', () => {
  const skillDir = makeSkillDir(EXPECTED_LARK_CLI_SUB_SKILLS.slice(0, -1));
  assert.deepEqual(findMissingLarkCliSkills(skillDir), [EXPECTED_LARK_CLI_SUB_SKILLS.at(-1)]);
});

test('retries the GitHub sub-skill fetch and verifies all files before succeeding', () => {
  const skillDir = makeSkillDir();
  let attempts = 0;
  installLarkCliSkills(skillDir, {
    target: '1.0.81',
    maxAttempts: 3,
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
  assert.equal(attempts, 3);
  assert.deepEqual(findMissingLarkCliSkills(skillDir), []);
});

test('reports GitHub asset fetch failure with an actionable retry command', () => {
  const skillDir = makeSkillDir();
  assert.throws(() => installLarkCliSkills(skillDir, {
    target: '1.0.81',
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

test('the declared repair hook reuses the same integrity repair implementation', () => {
  const skill = fs.readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  const repair = fs.readFileSync(new URL('../hooks/repair.js', import.meta.url), 'utf8');
  assert.match(skill, /repair:\s+hooks\/repair\.js/);
  assert.match(repair, /installLarkCliSkills\(SKILL_DIR\)/);
  assert.match(repair, /process\.exitCode\s*=\s*1/);
});
