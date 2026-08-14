import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { verifyPackage } from '../scripts/verify-package.mjs';
import { EXPECTED_LARK_CLI_SUB_SKILLS } from '../channels/001_feishu/hooks/post-install-shared.js';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-package-policy-'));
  const component = path.join(root, 'channels', '001_feishu');
  fs.mkdirSync(path.join(component, 'src'), { recursive: true });
  fs.writeFileSync(path.join(component, 'package.json'), JSON.stringify({
    name: 'yos-feishu-fixture',
    version: '1.0.0',
    files: ['src/', 'vendor/', 'README.md'],
  }));
  fs.writeFileSync(path.join(component, 'README.md'), '# Fixture\n');
  fs.writeFileSync(path.join(component, 'src', 'index.js'), 'export {};\n');
  const vendorRoot = path.join(component, 'vendor', 'lark-cli-skills');
  fs.mkdirSync(vendorRoot, { recursive: true });
  fs.writeFileSync(path.join(vendorRoot, 'LICENSE'), 'MIT\n');
  for (const name of EXPECTED_LARK_CLI_SUB_SKILLS) {
    const skillRoot = path.join(vendorRoot, 'skills', name);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), `# ${name}\n`);
  }
  fs.writeFileSync(path.join(vendorRoot, 'source.json'), JSON.stringify({
    fileCount: EXPECTED_LARK_CLI_SUB_SKILLS.length,
  }));
  git(root, ['init', '--quiet']);
  git(root, ['add', '.']);
  return { root, component };
}

test('Feishu package gate rejects an untracked packaged file', () => {
  const fixture = createFixture();
  try {
    fs.writeFileSync(path.join(fixture.component, 'src', 'local.js'), 'export const local = true;\n');
    assert.throws(
      () => verifyPackage({ ...fixture, requiredFiles: ['package.json', 'README.md', 'src/index.js'] }),
      /package contains an untracked file: src\/local\.js/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Feishu package gate rejects a package that omits the entire vendor tree', () => {
  const fixture = createFixture();
  try {
    const pkgPath = path.join(fixture.component, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.files = pkg.files.filter((entry) => entry !== 'vendor/');
    fs.writeFileSync(pkgPath, JSON.stringify(pkg));
    assert.throws(
      () => verifyPackage({ ...fixture, requiredFiles: ['package.json', 'README.md', 'src/index.js'] }),
      /required package file is missing: vendor\/lark-cli-skills\/(?:LICENSE|source\.json)/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Feishu package gate rejects a package that excludes one declared sub-skill', () => {
  const fixture = createFixture();
  try {
    const missing = EXPECTED_LARK_CLI_SUB_SKILLS[0];
    const pkgPath = path.join(fixture.component, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.files.push(`!vendor/lark-cli-skills/skills/${missing}/SKILL.md`);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg));
    assert.throws(
      () => verifyPackage({ ...fixture, requiredFiles: ['package.json', 'README.md', 'src/index.js'] }),
      new RegExp(`required packaged sub-skill is missing: ${missing}`),
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Feishu package gate rejects a vendor file-count mismatch', () => {
  const fixture = createFixture();
  try {
    const sourcePath = path.join(
      fixture.component,
      'vendor',
      'lark-cli-skills',
      'source.json',
    );
    fs.writeFileSync(sourcePath, JSON.stringify({ fileCount: 1 }));
    assert.throws(
      () => verifyPackage({ ...fixture, requiredFiles: ['package.json', 'README.md', 'src/index.js'] }),
      /packaged vendor file count 27 does not match source manifest 1/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Feishu package gate rejects private home paths in tracked content', () => {
  const fixture = createFixture();
  try {
    fs.writeFileSync(path.join(fixture.component, 'README.md'), 'Read /Users/private-owner/secrets here.\n');
    assert.throws(
      () => verifyPackage({ ...fixture, requiredFiles: ['package.json', 'README.md', 'src/index.js'] }),
      /package content failed hygiene check: README\.md/,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
