import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mayAskInteractively } from '../hooks/post-install-shared.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, '..', 'hooks', 'post-install.js');
const SHARED = path.join(HERE, '..', 'hooks', 'post-install-shared.js');

describe('mayAskInteractively', () => {
  it('may ask when the customer is sitting at a terminal', () => {
    assert.equal(mayAskInteractively({ isTTY: true, env: {} }), true);
  });

  it('may not ask when there is no terminal', () => {
    assert.equal(mayAskInteractively({ isTTY: false, env: {} }), false);
  });

  // The bug: `yos add feishu -y` honoured the flag in the CLI, then this hook
  // asked "Choose mode [1/2]" on the same terminal and waited forever. Having a
  // terminal is not permission to use it.
  it('may not ask on a terminal when the install promised not to ask', () => {
    assert.equal(mayAskInteractively({ isTTY: true, env: { YOS_ASSUME_YES: '1' } }), false);
  });

  it('only treats the exact opt-out value as the promise', () => {
    for (const value of ['0', '', 'false', 'no', undefined]) {
      assert.equal(
        mayAskInteractively({ isTTY: true, env: value === undefined ? {} : { YOS_ASSUME_YES: value } }),
        true,
        `YOS_ASSUME_YES=${JSON.stringify(value)} should not silence the prompt`
      );
    }
  });
});

describe('post-install hook wiring (structural)', () => {
  const source = fs.readFileSync(HOOK, 'utf8');

  it('routes its one interactive decision through mayAskInteractively', () => {
    assert.match(source, /const isInteractive = mayAskInteractively\(/,
      'the hook decides for itself again — a --yes install can hang here');
  });

  it('imports the helper it decides with', () => {
    assert.match(source, /mayAskInteractively,?\s*\n?[^}]*} from '\.\/post-install-shared\.js'/s,
      'mayAskInteractively is used but not imported — the hook would crash on install');
  });

  it('says which connection mode it picked when it did not ask', () => {
    // Choosing silently is the other half of the same defect: an unattended
    // machine ends up on a mode nobody chose and nobody was told about.
    // Anchor on the region under test, not on a `} else {` token: this file
    // nests if/else inside the interactive branch, so "the first else after
    // the if" lands on a neighbour that knows nothing about connection modes.
    // Take everything between the mode decision and the next step instead.
    const ifAt = source.indexOf('if (isInteractive) {');
    assert.ok(ifAt > 0, 'the interactive branch is gone');
    const endAt = source.indexOf('requireMinCoreVersion()', ifAt);
    assert.ok(endAt > ifAt, 'cannot find where the mode step ends');
    const region = source.slice(ifAt, endAt);

    assert.match(region, /\}\s*else\s*\{/, 'the non-interactive branch is gone — installs choose in silence again');
    assert.match(region, /not asking/i, 'the silent branch never admits it did not ask');
    assert.match(region, /connection_mode/, 'it does not say where to change the mode');
  });
});

describe('sub-skill install must not stop for npx (structural)', () => {
  const source = fs.readFileSync(SHARED, 'utf8');

  it('answers npx before naming the package', () => {
    // npx asks "Need to install the following packages ... Ok to proceed?"
    // for a package it has not cached. A `-y` after the package name is an
    // argument for that package, not an answer for npx — the install hung
    // right here with everything else already answered.
    const at = source.indexOf("execFileSync('npx', [");
    assert.ok(at > 0, 'the npx call is gone — re-check this guard');
    const call = source.slice(at, source.indexOf(']', at));
    const yesAt = call.indexOf("'--yes'");
    const pkgAt = call.indexOf("'xc-skills@latest'");
    assert.ok(yesAt > 0, 'npx is invoked without --yes; it will stop and ask on a terminal');
    assert.ok(pkgAt > 0, 'cannot find the package argument');
    assert.ok(yesAt < pkgAt, '--yes comes after the package name, so npx never sees it');
  });
});
