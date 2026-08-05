import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { readRefreshLimit } from '../src/auth/login-qr.ts';

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
