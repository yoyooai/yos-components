import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MessageItemType } from '../src/api/types.ts';
import {
  getContextToken,
  restoreContextTokens,
  setContextToken,
  weixinMessageToMsgContext,
} from '../src/messaging/inbound.ts';

test('inbound conversion keeps the server message ID and direct text', () => {
  const context = weixinMessageToMsgContext({
    message_id: 12345,
    from_user_id: 'user_1',
    context_token: 'context_1',
    item_list: [{ type: MessageItemType.TEXT, text_item: { text: '你好' } }],
  }, 'bot_1');

  assert.equal(context.Body, '你好');
  assert.equal(context.MessageSid, '12345');
  assert.equal(context.OriginatingChannel, 'weixin');
});

test('context tokens survive service restart in a private account file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-weixin-context-'));
  const previous = process.env.YOS_WEIXIN_DATA_DIR;
  process.env.YOS_WEIXIN_DATA_DIR = root;
  try {
    setContextToken('bot_1', 'user_1', 'context_1');
    const file = path.join(root, 'accounts', 'bot_1.context-tokens.json');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    restoreContextTokens('bot_1');
    assert.equal(getContextToken('bot_1', 'user_1'), 'context_1');
  } finally {
    if (previous === undefined) delete process.env.YOS_WEIXIN_DATA_DIR;
    else process.env.YOS_WEIXIN_DATA_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
