import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizePrivateMessage } from '../src/lib/dm-access.js';

test('unauthorized private messages never read protected Feishu content', async () => {
  const config = {
    owner: { bound: true, user_id: 'owner-user', open_id: 'owner-open' },
    dmPolicy: 'owner',
    dmAllowFrom: [],
  };
  let imMessageGetCalls = 0;

  const result = await authorizePrivateMessage({
    config,
    userId: 'intruder-user',
    openId: 'intruder-open',
    resolveUserName: async () => 'Intruder',
    saveConfig: () => true,
    resolveProtectedContent: async () => {
      imMessageGetCalls += 1;
      return 'protected merge-forward content';
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(imMessageGetCalls, 0, 'im.message.get must stay behind the DM access gate');
});

test('the first private sender is persisted as owner before access is granted', async () => {
  const config = {
    owner: { bound: false, user_id: '', open_id: '', name: '' },
    dmPolicy: 'owner',
    dmAllowFrom: [],
  };
  const saved = [];

  const result = await authorizePrivateMessage({
    config,
    userId: 'first-user',
    openId: 'first-open',
    resolveUserName: async () => 'First User',
    saveConfig: (nextConfig) => {
      saved.push(structuredClone(nextConfig));
      return true;
    },
  });

  assert.equal(result.allowed, true);
  assert.equal(result.boundOwnerName, 'First User');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].owner, {
    bound: true,
    user_id: 'first-user',
    open_id: 'first-open',
    name: 'First User',
  });
});
