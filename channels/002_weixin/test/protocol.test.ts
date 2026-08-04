import assert from 'node:assert/strict';
import test from 'node:test';

import { apiPostFetch, classifyFetchError, sanitizeBotAgent } from '../src/api/api.ts';
import { normalizeWeixinBaseUrl } from '../src/auth/accounts.ts';
import { redactBody, redactUrl } from '../src/util/redact.ts';

test('API origins are restricted to credential-free Tencent Weixin HTTPS hosts', () => {
  assert.equal(normalizeWeixinBaseUrl('https://ilinkai.weixin.qq.com/'), 'https://ilinkai.weixin.qq.com');
  for (const value of [
    'http://ilinkai.weixin.qq.com',
    'https://user:pass@ilinkai.weixin.qq.com',
    'https://ilinkai.weixin.qq.com?token=secret',
    'https://ilinkai.weixin.qq.com#secret',
    'https://weixin.qq.com.example.test',
  ]) assert.throws(() => normalizeWeixinBaseUrl(value), /invalid_weixin_api_origin/);
});

test('API rejects every invalid origin shape before network access', async () => {
  let called = false;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { called = true; throw new Error('unexpected'); };
  try {
    for (const baseUrl of [
      'http://ilinkai.weixin.qq.com',
      'https://user:pass@ilinkai.weixin.qq.com',
      'https://ilinkai.weixin.qq.com?token=secret',
      'https://ilinkai.weixin.qq.com#secret',
      'https://weixin.qq.com.example.test',
    ]) {
      await assert.rejects(() => apiPostFetch({
        baseUrl,
        endpoint: 'ilink/bot/getupdates',
        body: '{}',
        label: 'test',
      }), /invalid_weixin_api_origin/);
    }
    assert.equal(called, false);
  } finally {
    globalThis.fetch = previous;
  }
});

test('HTTP errors do not expose the raw server response', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response('private-upstream-detail', { status: 500 });
  try {
    await assert.rejects(
      () => apiPostFetch({
        baseUrl: 'https://ilinkai.weixin.qq.com',
        endpoint: 'ilink/bot/getupdates',
        body: '{}',
        label: 'getUpdates',
      }),
      (error: Error) => error.message === 'getUpdates http_500',
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test('protocol diagnostics redact tokens, query strings, and classify network failures', () => {
  assert.equal(sanitizeBotAgent(undefined), 'YOS/0.1.0-alpha.1');
  assert.equal(redactBody('{"context_token":"secret","text":"ok"}'), '{"context_token":"<redacted>","text":"ok"}');
  assert.equal(redactUrl('https://example.test/path?token=secret'), 'https://example.test/path?<redacted>');
  const aborted = new Error('aborted');
  aborted.name = 'AbortError';
  assert.equal(classifyFetchError(aborted).type, 'timeout');
});
