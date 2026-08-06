import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { readRefreshLimit, readLoginTimeoutMinutes, readLoginTimeoutMs, describeRemaining } from '../src/auth/login-qr.ts';

const COMPONENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(COMPONENT, 'src', 'auth', 'login-qr.ts'), 'utf8');

describe('an unscanned QR code is replaced long enough to hand it to someone else', () => {
  it('waits far longer than the three tries that assumed a local terminal', () => {
    // A code lives about a minute. Three replacements gave roughly three
    // minutes, which expired mid-relay when the machine was remote and the
    // phone was somewhere else.
    assert.ok(readRefreshLimit({}) >= 20, `default refresh limit is ${readRefreshLimit({})}`);
  });

  it('honours an explicit limit', () => {
    assert.equal(readRefreshLimit({ WEIXIN_QR_MAX_REFRESH: '5' }), 5);
  });

  it('ignores values that would silently shorten or break the wait', () => {
    for (const value of ['0', '-1', 'many', '', '2.5']) {
      assert.equal(
        readRefreshLimit({ WEIXIN_QR_MAX_REFRESH: value }),
        30,
        `"${value}" should fall back to the default rather than be trusted`,
      );
    }
  });

  it('the give-up branch reads the configured limit, not a literal', () => {
    // Comparing against a literal here is how the limit and the message drift
    // apart — the wait would end at a number nothing else agrees with.
    const giveUp = source.match(/if \(qrRefreshCount > ([^)]+)\)/g) ?? [];
    assert.ok(giveUp.length >= 1, 'no give-up comparison found');
    for (const branch of giveUp) {
      assert.match(branch, /MAX_QR_REFRESH_COUNT/, `give-up branch uses a literal: ${branch}`);
    }
  });

  it('tells the user the previous link is dead when it replaces one', () => {
    // Whoever is relaying the code may still be holding the older link.
    assert.match(source, /上一个链接已失效/);
  });
});

describe('login total deadline (2026-08-06: 8 min was the real blocker)', () => {
  it('defaults far beyond the 8 minutes that assumed a local scanner', () => {
    // 8 分钟是按"扫码的人坐在这台机器前"定的。真实场景是机器在云上、人在别处，
    // 一次远程交接（取链接→发过去→切窗口→确认）常常超过 8 分钟。
    assert.ok(
      readLoginTimeoutMinutes({}) >= 20,
      `default login timeout is ${readLoginTimeoutMinutes({})} minutes`,
    );
  });

  it('honours an explicit limit', () => {
    assert.equal(readLoginTimeoutMinutes({ WEIXIN_LOGIN_TIMEOUT_MINUTES: '45' }), 45);
  });

  it('ignores values that would silently shorten or break the wait', () => {
    for (const value of ['0', '-5', 'abc', '', '1.5']) {
      assert.equal(
        readLoginTimeoutMinutes({ WEIXIN_LOGIN_TIMEOUT_MINUTES: value }),
        30,
        `bad value ${JSON.stringify(value)} must fall back to the default, not shorten the wait`,
      );
    }
  });

  it('the millisecond form agrees with the minute form (no second source of truth)', () => {
    assert.equal(readLoginTimeoutMs({}), readLoginTimeoutMinutes({}) * 60_000);
    assert.equal(readLoginTimeoutMs({ WEIXIN_LOGIN_TIMEOUT_MINUTES: '12' }), 12 * 60_000);
  });

  it('the login command reads the configured deadline, not a literal', () => {
    // 两处各写一个数，迟早对不上；而且"悄悄改回 8 分钟"正是这次要防的回退。
    const loginSrc = fs.readFileSync(path.join(COMPONENT, 'scripts', 'login.ts'), 'utf8');
    assert.match(loginSrc, /timeoutMs:\s*readLoginTimeoutMs\(\)/,
      'scripts/login.ts must take the deadline from readLoginTimeoutMs()');
    assert.doesNotMatch(loginSrc, /timeoutMs:\s*\d/,
      'scripts/login.ts must not hardcode a deadline');
  });

  it('waitForWeixinLogin defaults to the same source, not its own literal', () => {
    assert.match(source, /opts\.timeoutMs \?\? readLoginTimeoutMs\(\)/,
      'the wait loop must fall back to the shared default');
  });

  it('tells the waiting person how much time is left, in words', () => {
    // 闷着等到超时，人不知道还该不该继续等、要不要重新叫人。
    assert.equal(describeRemaining(90_000), '1 分 30 秒');
    assert.equal(describeRemaining(45_000), '45 秒');
    assert.equal(describeRemaining(-1), '0 秒');
  });
});
