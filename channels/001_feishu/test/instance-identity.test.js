import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeInstance, duplicateConnectionNotice } from '../src/lib/instance-identity.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, '..', 'src', 'index.js');

const APP_ID = 'cli_aaad4f7312345abcdef';

describe('describeInstance', () => {
  it('names the machine and the process', () => {
    const i = describeInstance({ appId: APP_ID, hostname: 'zhiyi', pid: 4242 });
    assert.equal(i.host, 'zhiyi');
    assert.equal(i.pid, 4242);
    assert.equal(i.short, 'zhiyi/4242');
  });

  it('tells two machines apart even on the same app', () => {
    const a = describeInstance({ appId: APP_ID, hostname: 'zhiyi', pid: 1 });
    const b = describeInstance({ appId: APP_ID, hostname: 'xiaozhuo', pid: 1 });
    assert.notEqual(a.short, b.short);
    assert.notEqual(a.line, b.line);
  });

  // A log line is a place credentials leak to. Enough of the App ID to tell two
  // apps apart, never enough to be a usable copy of one.
  it('never puts the whole App ID in a log line', () => {
    const i = describeInstance({ appId: APP_ID, hostname: 'h', pid: 1 });
    assert.ok(!i.line.includes(APP_ID), 'the full App ID reached the log line');
    assert.ok(!i.app.includes(APP_ID), 'the full App ID reached the app field');
    assert.ok(i.app.length <= 10, `app fingerprint is too long: ${i.app}`);
    assert.match(i.app, /abcdef$/, 'the fingerprint should still identify the app');
  });

  it('degrades honestly when the App ID is not known yet', () => {
    const i = describeInstance({ appId: '', hostname: 'h', pid: 1 });
    assert.equal(i.app, '(unknown)', 'an unknown app must say so, not look like a real fingerprint');
  });
});

describe('duplicateConnectionNotice', () => {
  it('carries the identity it is warning about', () => {
    const i = describeInstance({ appId: APP_ID, hostname: 'zhiyi', pid: 7 });
    const text = duplicateConnectionNotice(i).join('\n');
    assert.ok(text.includes(i.line), 'the notice does not say which instance it belongs to');
  });

  it('states the fact that makes a split brain diagnosable', () => {
    const text = duplicateConnectionNotice(describeInstance({ appId: APP_ID })).join('\n').toLowerCase();
    // The trap is not that events are split — it is that each log looks fine
    // alone, so nobody thinks to compare. That has to be said out loud.
    assert.match(text, /only one connection|only\s+one/i);
    assert.match(text, /normal on its own|compare/);
  });
});

describe('feishu channel wiring (structural)', () => {
  const source = fs.readFileSync(INDEX, 'utf8');

  it('prints the notice at startup, before traffic', () => {
    const noticeAt = source.indexOf('duplicateConnectionNotice(');
    const transportAt = source.indexOf("if (connectionMode === 'webhook') {\n    startWebhook");
    assert.ok(noticeAt > 0, 'startup no longer says which machine this is');
    assert.ok(transportAt > noticeAt, 'the notice is printed after the transport starts — too late');
  });

  it('stamps every handled message with the machine that handled it', () => {
    // Without this, two machines on one App ID produce two logs that are each
    // internally consistent and jointly useless.
    const at = source.indexOf('[feishu] Logged:');
    assert.ok(at > 0, 'the per-message log line is gone');
    const line = source.slice(at, source.indexOf('\n', at));
    assert.match(line, /handled by/, 'the handled-message log no longer names the machine');
    assert.match(line, /describeInstance\(/, 'the stamp is not built from the instance identity');
  });
});
