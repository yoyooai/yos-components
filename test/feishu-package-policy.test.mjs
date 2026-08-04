import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { verifyPackage } from '../scripts/verify-package.mjs';

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
    files: ['src/', 'README.md'],
  }));
  fs.writeFileSync(path.join(component, 'README.md'), '# Fixture\n');
  fs.writeFileSync(path.join(component, 'src', 'index.js'), 'export {};\n');
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
