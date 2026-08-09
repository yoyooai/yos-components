import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, { cwd, input, encoding = 'utf8' } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    encoding,
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function packageContentDigest(componentDir) {
  const report = JSON.parse(run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: componentDir,
  }));
  if (!Array.isArray(report) || report.length !== 1 || !Array.isArray(report[0].files)) {
    throw new Error('npm pack returned an unexpected manifest');
  }
  const digest = createHash('sha256');
  for (const entry of [...report[0].files].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    digest.update(entry.path);
    digest.update('\0');
    digest.update(fs.readFileSync(path.join(componentDir, entry.path)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function discoverComponents(root) {
  const channelsDir = path.join(root, 'channels');
  return fs.readdirSync(channelsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const relative = path.join('channels', entry.name);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, relative, 'package.json'), 'utf8'));
      const registryName = manifest.yos?.id?.split('.').at(-1);
      if (!registryName || typeof manifest.version !== 'string') {
        throw new Error(`${relative}: component identity or version is missing`);
      }
      return { registryName, version: manifest.version, relative };
    });
}

function tagExists(root, tag) {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
    cwd: root,
    stdio: 'ignore',
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

function releasedDigest(root, tag, relative) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-released-component-'));
  try {
    const archive = run('git', ['archive', '--format=tar', tag, '--', relative], {
      cwd: root,
      encoding: null,
    });
    run('tar', ['-xf', '-', '-C', temporaryRoot], { input: archive });
    return packageContentDigest(path.join(temporaryRoot, relative));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function verifyReleasedVersionImmutability({ root = ROOT } = {}) {
  const checked = [];
  for (const component of discoverComponents(root)) {
    const tag = `${component.registryName}-v${component.version}`;
    if (!tagExists(root, tag)) continue;
    const current = packageContentDigest(path.join(root, component.relative));
    const released = releasedDigest(root, tag, component.relative);
    if (current !== released) {
      throw new Error(
        `${component.registryName}@${component.version} differs from already published tag ${tag}; `
        + 'advance the component version before publishing changed package content',
      );
    }
    checked.push(tag);
  }
  return checked;
}

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
if (invokedPath === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const checked = verifyReleasedVersionImmutability();
    console.log(`[release-version-policy] checked ${checked.length} published version(s)`);
  } catch (error) {
    console.error(`[release-version-policy] ${error.message}`);
    process.exit(1);
  }
}
