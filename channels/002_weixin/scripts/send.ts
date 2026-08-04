#!/usr/bin/env node
import { listIndexedWeixinAccountIds, loadWeixinAccount } from '../src/auth/accounts.ts';
import { getContextToken, restoreContextTokens } from '../src/messaging/inbound.ts';
import { sendMessageWeixin } from '../src/messaging/send.ts';
import { parseWeixinEndpoint } from '../src/yos/c4.ts';

function splitText(text: string, maximum = 4000): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maximum) {
    const newline = remaining.lastIndexOf('\n', maximum);
    const splitAt = newline > maximum / 3 ? newline : maximum;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function main(): Promise<void> {
  const [rawEndpoint, ...messageParts] = process.argv.slice(2);
  if (!rawEndpoint || messageParts.length === 0) throw new Error('usage: send.ts <endpoint> <message>');
  const text = messageParts.join(' ');
  if (text.trim() === '[SKIP]') return;
  if (/^\[MEDIA:/i.test(text)) throw new Error('weixin_media_reply_not_supported');

  const endpoint = parseWeixinEndpoint(rawEndpoint);
  const accountId = endpoint.account;
  if (!accountId || !listIndexedWeixinAccountIds().includes(accountId)) {
    throw new Error('weixin_reply_account_not_found');
  }
  const account = loadWeixinAccount(accountId);
  if (!account?.token) throw new Error('weixin_reply_credential_missing');
  restoreContextTokens(accountId);
  const contextToken = getContextToken(accountId, endpoint.userId);
  if (!contextToken) throw new Error('weixin_reply_context_missing');

  for (const chunk of splitText(text)) {
    await sendMessageWeixin({
      to: endpoint.userId,
      text: chunk,
      opts: {
        baseUrl: account.baseUrl || 'https://ilinkai.weixin.qq.com',
        token: account.token,
        contextToken,
      },
    });
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`[weixin] ${error instanceof Error ? error.message : 'weixin_reply_failed'}\n`);
  process.exitCode = 1;
}
