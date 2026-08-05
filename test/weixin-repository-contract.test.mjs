import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'channels', '002_weixin');
const UPSTREAM_COMMIT = 'cef0bfc390393f716903e16d50408118047f87e0';

function read(relativePath) {
  return fs.readFileSync(path.join(COMPONENT, relativePath), 'utf8');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

test('Weixin is a standalone YOS channel component', () => {
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
    'src/index.ts',
    'scripts/login.ts',
    'scripts/send.ts',
  ]) {
    assert.equal(fs.existsSync(path.join(COMPONENT, relativePath)), true, relativePath);
  }
});

test('Weixin metadata targets the current YOS component contract', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'yos-weixin');
  assert.equal(pkg.engines.node, '>=24.18.0 <25.0.0');
  assert.deepEqual(pkg.yos, {
    id: 'channel.weixin',
    core: '>=0.1.0-alpha.1 <0.2.0',
    upstreamVersion: '2.4.6',
  });

  const skill = read('SKILL.md');
  assert.match(skill, /^name: weixin$/m);
  assert.match(skill, /name: yos-weixin/);
  assert.match(skill, /~\/yos\/components\/weixin/);

  // See the Feishu contract: the two declarations must agree with each other,
  // which is the drift that would actually reach a user.
  const declaredVersion = skill.match(/^version: (.+)$/m)?.[1];
  assert.equal(declaredVersion, pkg.version, 'SKILL.md and package.json disagree on the version');
  // The line, not the number: 0.1.x, with or without a prerelease suffix.
  // Pinning the alpha shape blocked the intended move to a stable 0.1.0 on
  // 2026-08-06; pinning nothing would let a stray 1.0.0 or 0.2.0 ship.
  assert.match(pkg.version, /^0\.1\.\d+(-alpha\.\d+)?$/, 'component drifted off the 0.1.x line');
});

test('provenance locks Tencent upstream v2.4.6 exactly', () => {
  const provenance = JSON.parse(read('provenance/upstream.json'));
  assert.equal(provenance.repository, 'https://github.com/Tencent/openclaw-weixin');
  assert.equal(provenance.commit, UPSTREAM_COMMIT);
  assert.equal(provenance.version, '2.4.6');
  assert.equal(provenance.license, 'MIT');
});

test('runtime is adapted to YOS without legacy host integration', () => {
  const scannedRoots = ['src', 'hooks', 'scripts', 'test'];
  const files = scannedRoots.flatMap((directory) => walk(path.join(COMPONENT, directory)));
  files.push(
    path.join(COMPONENT, 'package.json'),
    path.join(COMPONENT, 'SKILL.md'),
    path.join(COMPONENT, 'ecosystem.config.cjs'),
    path.join(COMPONENT, 'README.md'),
  );

  const forbidden = [
    /from ["']openclaw\//,
    /~\/\.openclaw/,
    /~\/zylos/,
    /~\/\.zylos/,
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

test('runtime exposes C4 receive and reply entrypoints', () => {
  const service = read('src/index.ts');
  const c4 = read('src/yos/c4.ts');
  const sender = read('scripts/send.ts');
  assert.match(c4, /c4-receive\.js/);
  assert.match(c4, /--message-id/);
  assert.match(service, /deliverToC4/);
  assert.match(sender, /sendMessageWeixin/);
  assert.match(sender, /contextToken/);
});

test('npm package creation invokes the Weixin package gate', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.prepack, 'node ../../scripts/verify-weixin-package.mjs');
  const verify = fs.readFileSync(path.join(ROOT, 'scripts', 'verify.mjs'), 'utf8');
  assert.match(verify, /Weixin package contract/);
  assert.match(verify, /verify-weixin-package\.mjs/);
});
