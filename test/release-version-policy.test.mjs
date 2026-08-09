import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const policyModule = await import('../scripts/release-version-policy.mjs').catch((loadError) => ({ loadError }));

function runGit(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-release-version-'));
  const component = path.join(root, 'channels', '001_example');
  fs.mkdirSync(component, { recursive: true });
  fs.writeFileSync(path.join(component, 'package.json'), JSON.stringify({
    name: 'yos-example',
    version: '0.1.0',
    files: ['README.md'],
    yos: { id: 'channel.example' },
  }, null, 2));
  fs.writeFileSync(path.join(component, 'README.md'), 'released\n');
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.email', 'test@example.invalid']);
  runGit(root, ['config', 'user.name', 'Test']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'release fixture']);
  runGit(root, ['tag', 'example-v0.1.0']);
  return { root, component };
}

function verify(root) {
  assert.equal(
    typeof policyModule.verifyReleasedVersionImmutability,
    'function',
    `release-version-policy.mjs must export verifyReleasedVersionImmutability (${policyModule.loadError?.code ?? 'missing export'})`,
  );
  return policyModule.verifyReleasedVersionImmutability({ root });
}

test('rejects changed package content under an already published version', () => {
  const { root, component } = fixtureRepo();
  try {
    assert.doesNotThrow(() => verify(root));
    fs.writeFileSync(path.join(component, 'README.md'), 'changed without a version bump\n');
    assert.throws(() => verify(root), /already published|version/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('allows changed package content after the component version is advanced', () => {
  const { root, component } = fixtureRepo();
  try {
    fs.writeFileSync(path.join(component, 'README.md'), 'changed for a new release\n');
    const manifest = JSON.parse(fs.readFileSync(path.join(component, 'package.json'), 'utf8'));
    manifest.version = '0.1.1';
    fs.writeFileSync(path.join(component, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    assert.doesNotThrow(() => verify(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
