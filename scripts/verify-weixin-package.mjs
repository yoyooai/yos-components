import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT_RELATIVE = path.join('channels', '002_weixin');
const COMPONENT = path.join(ROOT, COMPONENT_RELATIVE);
const REQUIRED_FILES = [
  'CHANGELOG.md', 'LICENSE', 'README.md', 'SKILL.md',
  'THIRD_PARTY_NOTICES.md', 'ecosystem.config.cjs', 'hooks/post-install.js',
  'package.json', 'provenance/upstream.json', 'scripts/login.js', 'scripts/login.ts',
  'scripts/send.js', 'scripts/send.ts', 'src/index.ts',
];
const FORBIDDEN_PATHS = [
  /(^|\/)test(s)?\//, /(^|\/)node_modules\//, /(^|\/)\.env(?:\.|$)/,
  /(^|\/)coverage\//, /\.(?:key|pem|p12|pfx)$/i,
];
const FORBIDDEN_CONTENT = [
  /sk-[A-Za-z0-9_-]{20,}/, /LTAI[A-Za-z0-9]{12,}/,
  /Bearer\s+[A-Za-z0-9._~+\/-]{20,}/,
  /\/Users\/(?!example-user(?:\/|\b))[^/<\s"']+/,
  /\/home\/(?!example-user(?:\/|\b))[^/<\s"']+/,
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function packageManifest() {
  const report = JSON.parse(run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: COMPONENT }));
  if (!Array.isArray(report) || report.length !== 1 || !Array.isArray(report[0].files)) {
    throw new Error('npm pack returned an unexpected manifest');
  }
  return report[0];
}

function trackedFiles() {
  return new Set(run('git', ['ls-files', '--', COMPONENT_RELATIVE])
    .split('\n')
    .filter(Boolean)
    .map((file) => path.relative(COMPONENT_RELATIVE, file)));
}

function verify() {
  const manifest = packageManifest();
  const files = manifest.files.map(({ path: file }) => file).sort();
  const fileSet = new Set(files);
  const tracked = trackedFiles();
  for (const required of REQUIRED_FILES) {
    if (!fileSet.has(required)) throw new Error(`required package file is missing: ${required}`);
  }

  const digest = createHash('sha256');
  for (const relativePath of files) {
    for (const pattern of FORBIDDEN_PATHS) {
      if (pattern.test(relativePath)) throw new Error(`forbidden package path: ${relativePath}`);
    }
    if (!tracked.has(relativePath)) throw new Error(`package contains an untracked file: ${relativePath}`);
    const bytes = fs.readFileSync(path.join(COMPONENT, relativePath));
    const text = bytes.toString('utf8');
    for (const pattern of FORBIDDEN_CONTENT) {
      if (pattern.test(text)) throw new Error(`package content failed hygiene check: ${relativePath}`);
    }
    digest.update(relativePath);
    digest.update('\0');
    digest.update(bytes);
    digest.update('\0');
  }

  console.log(JSON.stringify({
    package: `${manifest.name}@${manifest.version}`,
    entryCount: files.length,
    unpackedSize: manifest.unpackedSize,
    contentSha256: digest.digest('hex'),
  }, null, 2));
}

try {
  verify();
} catch (error) {
  console.error(`[verify-weixin-package] ${error.message}`);
  process.exit(1);
}
