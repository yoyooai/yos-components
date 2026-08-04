import { sendMessage as sendMessageApi } from '../api/api.ts';
import type { WeixinApiOptions } from '../api/api.ts';
import { MessageItemType, MessageState, MessageType } from '../api/types.ts';
import { logger } from '../util/logger.ts';
import { generateId } from '../util/random.ts';

export { StreamingMarkdownFilter } from './markdown-filter.ts';

export type WeixinMessageSendOptions = WeixinApiOptions & {
  contextToken?: string;
  runId?: string;
};

export async function sendMessageWeixin(params: {
  to: string;
  text: string;
  opts: WeixinMessageSendOptions;
}): Promise<{ messageId: string }> {
  const clientId = generateId('yos-weixin');
  await sendMessageApi({
    baseUrl: params.opts.baseUrl,
    token: params.opts.token,
    timeoutMs: params.opts.timeoutMs,
    body: {
      msg: {
        from_user_id: '',
        to_user_id: params.to,
        client_id: clientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        item_list: params.text
          ? [{ type: MessageItemType.TEXT, text_item: { text: params.text } }]
          : undefined,
        context_token: params.opts.contextToken,
        run_id: params.opts.runId,
      },
    },
  });
  logger.info(`text reply sent clientId=${clientId}`);
  return { messageId: clientId };
}
