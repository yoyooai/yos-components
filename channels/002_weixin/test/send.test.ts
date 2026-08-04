import assert from 'node:assert/strict';
import test from 'node:test';

import { sendMessageWeixin } from '../src/messaging/send.ts';

test('text reply carries the originating context token to the Tencent API', async () => {
  const previous = globalThis.fetch;
  let requestBody: Record<string, any> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response('{"ret":0}', { status: 200 });
  };
  try {
    const result = await sendMessageWeixin({
      to: 'user_1',
      text: '回复内容',
      opts: {
        baseUrl: 'https://ilinkai.weixin.qq.com',
        token: 'local-test-token',
        contextToken: 'context_1',
      },
    });
    assert.match(result.messageId, /^yos-weixin:/);
    assert.equal(requestBody?.msg?.to_user_id, 'user_1');
    assert.equal(requestBody?.msg?.context_token, 'context_1');
    assert.equal(requestBody?.msg?.item_list?.[0]?.text_item?.text, '回复内容');
  } finally {
    globalThis.fetch = previous;
  }
});
