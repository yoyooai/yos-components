/**
 * Every channel that lets PM2 restart it must also say how long a run has to
 * last to count as a success.
 *
 * `max_restarts` alone is inert: PM2 only counts a restart against the cap when
 * the process died sooner than `min_uptime`, whose default is one second. Both
 * channels shipped `max_restarts: 10` with no `min_uptime`, so a start that
 * failed a couple of seconds in — a channel with no credentials, the normal
 * state right after `yos add` — restarted without end. Measured on a clean
 * machine: 57 restarts and still climbing, against a config that reads as
 * capped at 10.
 *
 * The floor matches the core services in yos-core's PM2 template.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANNELS_DIR = path.join(ROOT, 'channels');

const MIN_UPTIME_FLOOR_MS = 10_000;
const MAX_RESTARTS_CEILING = 10;

function parseUptimeMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!match) return null;
  const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[(match[2] || 'ms').toLowerCase()];
  return Number(match[1]) * scale;
}

function channelEcosystems() {
  if (!fs.existsSync(CHANNELS_DIR)) return [];
  return fs.readdirSync(CHANNELS_DIR)
    .map((name) => ({ channel: name, file: path.join(CHANNELS_DIR, name, 'ecosystem.config.cjs') }))
    .filter((entry) => fs.existsSync(entry.file));
}

test('every channel PM2 app declares a restart cap that can actually fire', () => {
  const ecosystems = channelEcosystems();
  assert.ok(ecosystems.length > 0, 'no channel ecosystem configs found');

  for (const { channel, file } of ecosystems) {
    const apps = require(file).apps || [];
    assert.ok(apps.length > 0, `${channel}: ecosystem declares no apps`);

    for (const app of apps) {
      if (app.autorestart === false) continue;   // cannot loop

      const uptimeMs = parseUptimeMs(app.min_uptime);
      assert.ok(
        uptimeMs !== null,
        `${channel}/${app.name}: max_restarts without min_uptime never fires — add min_uptime: '10s'`,
      );
      assert.ok(
        uptimeMs >= MIN_UPTIME_FLOOR_MS,
        `${channel}/${app.name}: min_uptime ${app.min_uptime} is below the ${MIN_UPTIME_FLOOR_MS}ms floor`,
      );
      assert.ok(
        Number.isInteger(app.max_restarts) && app.max_restarts >= 0 && app.max_restarts <= MAX_RESTARTS_CEILING,
        `${channel}/${app.name}: max_restarts must be an integer 0..${MAX_RESTARTS_CEILING}, got ${app.max_restarts}`,
      );
    }
  }
});
