import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS_DIR = path.join(ROOT, 'channels');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

const verifySource = fs.readFileSync(path.join(SCRIPTS_DIR, 'verify.mjs'), 'utf8');

function componentDirs() {
  return fs
    .readdirSync(COMPONENTS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function componentPackageJson(name) {
  return JSON.parse(fs.readFileSync(path.join(COMPONENTS_DIR, name, 'package.json'), 'utf8'));
}

/** Package-contract scripts referenced by the repository-wide verify run. */
function contractScriptsInVerify() {
  return [...verifySource.matchAll(/verify(?:-[a-z0-9]+)?-package\.mjs/g)].map(match => match[0]);
}

/** The contract script that names this component directory. */
function contractFor(name) {
  return contractScriptsInVerify().find(script => {
    const file = path.join(SCRIPTS_DIR, script);
    return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(name);
  });
}

describe('every component is packaged under the same gate', () => {
  it('has components to check', () => {
    // A rename that emptied this list would make every assertion below vacuous.
    assert.ok(componentDirs().length >= 2, 'expected at least two components');
  });

  it('every component has a package contract wired into the repository verify', () => {
    // This is the gate the release procedure actually runs. Adding a third
    // channel without wiring it in would otherwise ship unverified: the release
    // would pass while nothing had checked what went into the package.
    for (const name of componentDirs()) {
      assert.ok(contractFor(name), `no package contract in verify.mjs covers ${name}`);
    }
  });

  it('every component runs its own contract on pack, none is left without one', () => {
    // Second line of defence for the ordinary `npm pack` path. It does not
    // replace the verify run above — `npm pack --ignore-scripts` skips prepack
    // entirely — but leaving it on one component and not the other is how the
    // two drifted apart: whoever packs the unguarded one gets no check at all.
    for (const name of componentDirs()) {
      const prepack = componentPackageJson(name).scripts?.prepack;
      assert.ok(prepack, `${name} has no prepack gate while its sibling does`);
      const contract = contractFor(name);
      assert.ok(
        prepack.includes(contract),
        `${name} packs with "${prepack}" but its contract in verify.mjs is ${contract}`,
      );
    }
  });
});
