import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listIndexedWeixinAccountIds,
  loadWeixinAccount,
  registerWeixinAccountId,
  resolveAccountStorageName,
  saveWeixinAccount,
} from '../src/auth/accounts.ts';

test('account credentials are stored privately under the YOS component data directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-weixin-account-'));
  const previous = process.env.YOS_WEIXIN_DATA_DIR;
  process.env.YOS_WEIXIN_DATA_DIR = root;
  try {
    saveWeixinAccount('bot_1', { token: 'secret-token', userId: 'user_1' });
    registerWeixinAccountId('bot_1');

    assert.deepEqual(listIndexedWeixinAccountIds(), ['bot_1']);
    assert.equal(loadWeixinAccount('bot_1')?.token, 'secret-token');
    assert.equal(fs.statSync(path.join(root, 'accounts')).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(root, 'accounts', 'bot_1.json')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.join(root, 'accounts.json')).mode & 0o777, 0o600);
  } finally {
    if (previous === undefined) delete process.env.YOS_WEIXIN_DATA_DIR;
    else process.env.YOS_WEIXIN_DATA_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('account storage rejects path traversal', () => {
  assert.throws(() => resolveAccountStorageName('../outside'), /invalid_weixin_account_id/);
});
