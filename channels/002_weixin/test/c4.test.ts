import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWeixinEndpoint, deliverToC4, parseWeixinEndpoint } from '../src/yos/c4.ts';

test('C4 endpoint preserves the Weixin user, account, and original message ID', () => {
  const endpoint = buildWeixinEndpoint('user_1', { accountId: 'bot_1', messageId: '98765' });
  assert.equal(endpoint, 'user_1|account:bot_1|msg:98765');
  assert.deepEqual(parseWeixinEndpoint(endpoint), {
    userId: 'user_1',
    account: 'bot_1',
    msg: '98765',
  });
});

test('C4 delivery uses execFile arguments and the original message ID as idempotency key', async () => {
  let invocation: { file: string; args: string[] } | undefined;
  const result = await deliverToC4({
    endpoint: 'user_1|account:bot_1|msg:98765',
    messageId: '98765',
    content: 'hello',
    executor: async (file, args) => {
      invocation = { file, args };
      return { stdout: '{"ok":true,"action":"queued","id":1}', stderr: '' };
    },
  });

  assert.equal(result.success, true);
  assert.equal(invocation?.file, process.execPath);
  assert.deepEqual(invocation?.args.slice(-5), [
    '--message-id', '98765', '--json', '--content', 'hello',
  ]);
  assert.equal(invocation?.args.includes('--channel'), true);
  assert.equal(invocation?.args.includes('weixin'), true);
});

test('endpoint parser rejects malformed and unknown fields', () => {
  assert.throws(() => parseWeixinEndpoint('../bad|account:bot_1'), /invalid_weixin_endpoint/);
  assert.throws(() => parseWeixinEndpoint('user_1|unknown:value'), /invalid_weixin_endpoint/);
});

test('C4 delivery rejects structured rejection and malformed output', async () => {
  const base = { endpoint: 'user_1|account:bot_1|msg:98765', messageId: '98765', content: 'hello' };
  await assert.rejects(() => deliverToC4({
    ...base,
    executor: async () => ({ stdout: '{"ok":false,"error":{"code":"blocked"}}', stderr: '' }),
  }), /c4_delivery_rejected/);
  await assert.rejects(() => deliverToC4({
    ...base,
    executor: async () => ({ stdout: 'not-json', stderr: '' }),
  }), /c4_invalid_response/);
});
