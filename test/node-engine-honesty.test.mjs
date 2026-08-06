import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * A channel's declared Node floor has to match the Node it actually runs on.
 *
 * Both channels shipped `>=24.18.0 <25.0.0` while the YOS installer accepts
 * Node 20 and up. Measured on 2026-08-06:
 *
 *   · 001_feishu  loads and passes its 29 tests on Node 20.20.0 — the 24.18
 *     floor excluded machines it runs on perfectly well.
 *   · 002_weixin  runs `.ts` entrypoints directly, so it dies with
 *     ERR_UNKNOWN_FILE_EXTENSION on 20.20.0 and on 22.17.1, and works from
 *     22.18.0 (where node strips types unflagged) onward.
 *
 * Declaring a floor that is too high locks out working machines; declaring one
 * that is too low installs a service that can never start. Both are silent, so
 * the declaration is pinned here to the reason it exists.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Where node began running TypeScript entrypoints without a flag. */
const TS_UNFLAGGED = [22, 18, 0];
/** The lowest Node the YOS installer will accept on a customer machine. */
const INSTALLER_FLOOR = [20, 20, 0];

function channels() {
  const dir = path.join(ROOT, 'channels');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, dir: path.join(dir, entry.name) }));
}

function declaredFloor(channelDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(channelDir, 'package.json'), 'utf8'));
  const range = pkg?.engines?.node;
  assert.equal(typeof range, 'string', `${channelDir} declares no engines.node`);
  const match = /^>=\s*v?(\d+)\.(\d+)\.(\d+)/.exec(range.trim());
  assert.ok(match, `engines.node "${range}" is not a plain >= floor; update this guard deliberately`);
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], range: range.trim() };
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function runsTypeScriptDirectly({ dir }) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const scripts = Object.values(pkg.scripts ?? {}).join(' ');
  if (/\bnode\b[^&|;]*\.ts\b/.test(scripts) || /--test[^&|;]*\.ts\b/.test(scripts)) return true;
  return walk(path.join(dir, 'src')).some((file) => file.endsWith('.ts'));
}

function atLeast(actual, floor) {
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== floor[index]) return actual[index] > floor[index];
  }
  return true;
}

test('a channel that runs TypeScript directly declares a Node that can load it', () => {
  for (const channel of channels()) {
    if (!runsTypeScriptDirectly(channel)) continue;
    const { parts, range } = declaredFloor(channel.dir);
    assert.ok(
      atLeast(parts, TS_UNFLAGGED),
      `${channel.name} runs .ts entrypoints but declares "${range}" — node strips types unflagged only from ${TS_UNFLAGGED.join('.')}, so a machine below that installs a service that can never start`,
    );
  }
});

test('a pure JavaScript channel does not lock out machines the installer accepts', () => {
  for (const channel of channels()) {
    if (runsTypeScriptDirectly(channel)) continue;
    const { parts, range } = declaredFloor(channel.dir);
    assert.deepEqual(
      parts,
      INSTALLER_FLOOR,
      `${channel.name} is plain JavaScript but declares "${range}"; the installer accepts Node ${INSTALLER_FLOOR.join('.')}, and a higher floor excludes machines this channel runs on`,
    );
  }
});

test('every channel declares a floor, and no channel caps the major version', () => {
  for (const channel of channels()) {
    const { range } = declaredFloor(channel.dir);
    // A `<25` cap turns every future Node major into a false incompatibility
    // report on machines the channel would run on unchanged.
    assert.doesNotMatch(
      range,
      /<\s*v?\d+/,
      `${channel.name} caps its Node range ("${range}"); an upper bound has to be justified by a measured failure, not by habit`,
    );
  }
});
