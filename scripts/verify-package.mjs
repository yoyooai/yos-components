import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = path.join(ROOT, 'channels', '001_feishu');
const REQUIRED_FILES = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'SKILL.md',
  'THIRD_PARTY_NOTICES.md',
  'ecosystem.config.cjs',
  'package.json',
  'provenance/upstream.json',
  'src/index.js',
];
const FORBIDDEN_PATHS = [
  /(^|\/)test(s)?\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)coverage\//,
  /\.(?:key|pem|p12|pfx)$/i,
];
const FORBIDDEN_CONTENT = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /LTAI[A-Za-z0-9]{12,}/,
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
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function readPackManifest(component) {
  const output = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: component,
  });
  const report = JSON.parse(output);
  if (!Array.isArray(report) || report.length !== 1 || !Array.isArray(report[0].files)) {
    throw new Error('npm pack returned an unexpected manifest');
  }
  return report[0];
}

function trackedFiles(root, component) {
  const relativeComponent = path.relative(root, component);
  return new Set(run('git', ['ls-files', '--', relativeComponent], { cwd: root })
    .split('\n')
    .filter(Boolean)
    .map((file) => path.relative(relativeComponent, file)));
}

export function verifyPackage({
  root = ROOT,
  component = COMPONENT,
  requiredFiles = REQUIRED_FILES,
} = {}) {
  const manifest = readPackManifest(component);
  const files = manifest.files.map(({ path: file }) => file).sort();
  const fileSet = new Set(files);
  const tracked = trackedFiles(root, component);

  for (const required of requiredFiles) {
    if (!fileSet.has(required)) throw new Error(`required package file is missing: ${required}`);
  }

  const digest = createHash('sha256');
  for (const relativePath of files) {
    for (const pattern of FORBIDDEN_PATHS) {
      if (pattern.test(relativePath)) throw new Error(`forbidden package path: ${relativePath}`);
    }
    if (!tracked.has(relativePath)) {
      throw new Error(`package contains an untracked file: ${relativePath}`);
    }

    const absolutePath = path.join(component, relativePath);
    const bytes = fs.readFileSync(absolutePath);
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

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
if (invokedPath === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    verifyPackage();
  } catch (error) {
    console.error(`[verify-package] ${error.message}`);
    process.exit(1);
  }
}
