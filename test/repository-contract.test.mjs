import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'channels', '001_feishu');
const UPSTREAM_COMMIT = '877690965798b99979f21211290d6f284be787b7';
const UPSTREAM_ARCHIVE_SHA256 = 'a7ceff5a7633e9a9041bbefaa5426108ce520b1b6b2bb5ce43e9da9a0aeac398';

function read(relativePath) {
  return fs.readFileSync(path.join(COMPONENT, relativePath), 'utf8');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

test('the first channel has the required standalone component files', () => {
  for (const relativePath of [
    'package.json',
    'package-lock.json',
    'SKILL.md',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'ecosystem.config.cjs',
    'provenance/upstream.json',
    'src/index.js',
  ]) {
    assert.equal(fs.existsSync(path.join(COMPONENT, relativePath)), true, relativePath);
  }
});

test('component metadata is independently versioned for the current YOS contract', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'yos-feishu');
  assert.equal(pkg.engines.node, '>=24.18.0 <25.0.0');
  assert.deepEqual(pkg.yos, {
    id: 'channel.feishu',
    core: '>=0.1.0-alpha.1 <0.2.0',
    upstreamVersion: '0.3.4',
  });

  const skill = read('SKILL.md');
  assert.match(skill, /^name: feishu$/m);
  assert.match(skill, /name: yos-feishu/);
  assert.match(skill, /~\/yos\/components\/feishu/);

  // The component declares its version twice. Pinning a literal here only
  // proves someone remembered to edit the test on release day; requiring the
  // two to agree catches the failure that actually ships — a component whose
  // manifest and package disagree about which version it is.
  const declaredVersion = skill.match(/^version: (.+)$/m)?.[1];
  assert.equal(declaredVersion, pkg.version, 'SKILL.md and package.json disagree on the version');
  // The line, not the number: 0.1.x, with or without a prerelease suffix.
  // Pinning the alpha shape blocked the intended move to a stable 0.1.0 on
  // 2026-08-06; pinning nothing would let a stray 1.0.0 or 0.2.0 ship.
  assert.match(pkg.version, /^0\.1\.\d+(-alpha\.\d+)?$/, 'component drifted off the 0.1.x line');
});

test('provenance locks the exact imported source and archive', () => {
  const provenance = JSON.parse(read('provenance/upstream.json'));
  assert.equal(provenance.repository, 'https://github.com/zylos-ai/zylos-feishu');
  assert.equal(provenance.commit, UPSTREAM_COMMIT);
  assert.equal(provenance.version, '0.3.4');
  assert.equal(provenance.archiveSha256, UPSTREAM_ARCHIVE_SHA256);
});

test('runtime and package surfaces contain no legacy product integration', () => {
  const scannedRoots = ['src', 'hooks', 'scripts', 'test'];
  const files = scannedRoots.flatMap((directory) => walk(path.join(COMPONENT, directory)));
  files.push(
    path.join(COMPONENT, 'package.json'),
    path.join(COMPONENT, 'SKILL.md'),
    path.join(COMPONENT, 'ecosystem.config.cjs'),
    path.join(COMPONENT, 'README.md'),
    path.join(COMPONENT, 'CHANGELOG.md'),
  );

  const forbidden = [
    /zylos/i,
    /coco/i,
    /~\/\.zylos/,
    /~\/zylos/,
    /\/Users\/(?!example-user)/,
    /\/home\/(?!example-user)/,
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(content, pattern, `${path.relative(ROOT, file)} matches ${pattern}`);
    }
  }
});
