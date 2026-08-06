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


  // ── What may hang on the pack lifecycle (TD-79,口径 settled 2026-08-06) ──
  //
  // The two repositories looked like they contradicted each other: the OS repo
  // forbids `prepack` outright, this one requires it. Reading both reasons, they
  // are not in conflict — they are the same rule applied to different facts:
  //
  //   The release gate never hangs on the pack lifecycle. A pack-lifecycle hook
  //   may only run a check that is cheap, self-contained, and also covered by
  //   verify — never the sole gate.
  //
  // The OS repo packs *itself* at runtime (self-upgrade builds a candidate with
  // `npm pack`), so a heavy prepack there would fire in the middle of a customer
  // upgrade; it uses prepublishOnly instead. Components are never npm-packed for
  // distribution (the mirror serves them from source), so a light contract check
  // on pack costs nothing and catches a hand-run `npm pack`.
  //
  // These assertions keep this repo's half of that rule honest: the hook stays
  // cheap, and it is never the only thing checking the package.

  it('the pack hook stays cheap — it must not pull in the full verify', () => {
    for (const name of componentDirs()) {
      const prepack = componentPackageJson(name).scripts?.prepack ?? '';
      assert.doesNotMatch(prepack, /verify\.mjs/, `${name} prepack must not run the repository verify`);
      assert.doesNotMatch(prepack, /npm run verify/, `${name} prepack must not run the repository verify`);
    }
  });

  it('⭐ the pack hook is never the only check — verify covers the same contract', () => {
    // If this ever fails, the prepack hook has become the sole gate, and
    // `npm pack --ignore-scripts` (a documented flag) would walk straight past
    // it. That is the failure TD-79 was actually pointing at.
    for (const name of componentDirs()) {
      const contract = contractFor(name);
      assert.ok(contract, `${name} has no contract wired into verify.mjs`);
      const prepack = componentPackageJson(name).scripts?.prepack ?? '';
      assert.ok(
        prepack.includes(contract),
        `${name}: prepack (${prepack}) and verify (${contract}) must run the same contract, `
        + 'so skipping the hook loses nothing',
      );
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
