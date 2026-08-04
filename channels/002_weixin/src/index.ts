#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { getUpdates, notifyStart, notifyStop } from './api/api.ts';
import { MessageType, type WeixinMessage } from './api/types.ts';
import { listIndexedWeixinAccountIds, loadWeixinAccount } from './auth/accounts.ts';
import {
  restoreContextTokens,
  setContextToken,
  weixinMessageToMsgContext,
} from './messaging/inbound.ts';
import { getSyncBufFilePath, loadGetUpdatesBuf, saveGetUpdatesBuf } from './storage/sync-buf.ts';
import { resolveStateDir } from './storage/state-dir.ts';
import { logger } from './util/logger.ts';
import { buildWeixinEndpoint, deliverToC4 } from './yos/c4.ts';

type Monitor = { controller: AbortController; promise: Promise<void> };
const monitors = new Map<string, Monitor>();
let shuttingDown = false;

function componentEnabled(): boolean {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(resolveStateDir(), 'config.json'), 'utf8'));
    return config.enabled !== false;
  } catch {
    return true;
  }
}

function originalMessageId(message: WeixinMessage): string | null {
  const id = message.message_id ?? message.item_list?.[0]?.msg_id;
  return id === undefined || id === null || String(id).trim() === '' ? null : String(id);
}

async function processMessage(accountId: string, message: WeixinMessage): Promise<void> {
  if (message.message_type !== undefined && message.message_type !== MessageType.USER) return;
  if (message.group_id) {
    logger.withAccount(accountId).warn('group message ignored: group support is not enabled in this alpha');
    return;
  }

  const messageId = originalMessageId(message);
  const userId = message.from_user_id?.trim();
  if (!messageId || !userId) throw new Error('invalid_weixin_message_identity');

  const context = weixinMessageToMsgContext(message, accountId);
  if (!context.Body.trim()) {
    logger.withAccount(accountId).warn(`unsupported non-text message ignored messageId=${messageId}`);
    return;
  }
  if (message.context_token) setContextToken(accountId, userId, message.context_token);

  const endpoint = buildWeixinEndpoint(userId, { accountId, messageId });
  await deliverToC4({ endpoint, messageId, content: context.Body });
  logger.withAccount(accountId).info(`delivered messageId=${messageId}`);
}

async function monitorAccount(accountId: string, signal: AbortSignal): Promise<void> {
  const account = loadWeixinAccount(accountId);
  if (!account?.token) return;
  const baseUrl = account.baseUrl || 'https://ilinkai.weixin.qq.com';
  const accountLogger = logger.withAccount(accountId);
  const syncFile = getSyncBufFilePath(accountId);
  let cursor = loadGetUpdatesBuf(syncFile) ?? '';
  restoreContextTokens(accountId);

  try {
    await notifyStart({ baseUrl, token: account.token });
  } catch (error) {
    accountLogger.warn(`start notification failed: ${error instanceof Error ? error.message : 'unknown_error'}`);
  }

  while (!signal.aborted) {
    try {
      const response = await getUpdates({
        baseUrl,
        token: account.token,
        get_updates_buf: cursor,
        abortSignal: signal,
      });
      if (signal.aborted) break;
      if ((response.ret ?? 0) !== 0 || (response.errcode ?? 0) !== 0) {
        throw new Error(`weixin_get_updates_failed_${response.errcode ?? response.ret}`);
      }
      for (const message of response.msgs ?? []) await processMessage(accountId, message);
      if (typeof response.get_updates_buf === 'string' && response.get_updates_buf !== cursor) {
        saveGetUpdatesBuf(syncFile, response.get_updates_buf);
        cursor = response.get_updates_buf;
      }
    } catch (error) {
      if (signal.aborted) break;
      accountLogger.error(error instanceof Error ? error.message : 'weixin_monitor_failed');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  try {
    await notifyStop({ baseUrl, token: account.token, timeoutMs: 5000 });
  } catch {
    accountLogger.warn('stop notification failed');
  }
}

function reconcileAccounts(): void {
  if (!componentEnabled()) {
    for (const monitor of monitors.values()) monitor.controller.abort();
    monitors.clear();
    return;
  }
  const configured = new Set(
    listIndexedWeixinAccountIds().filter((accountId) => Boolean(loadWeixinAccount(accountId)?.token)),
  );
  for (const [accountId, monitor] of monitors) {
    if (!configured.has(accountId)) {
      monitor.controller.abort();
      monitors.delete(accountId);
    }
  }
  for (const accountId of configured) {
    if (monitors.has(accountId)) continue;
    const controller = new AbortController();
    const promise = monitorAccount(accountId, controller.signal)
      .catch((error) => logger.withAccount(accountId).error(error instanceof Error ? error.message : 'monitor_stopped'))
      .finally(() => monitors.delete(accountId));
    monitors.set(accountId, { controller, promise });
  }
  if (configured.size === 0) logger.info('no logged-in account; run `yos-weixin login`');
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(reconcileTimer);
  for (const monitor of monitors.values()) monitor.controller.abort();
  await Promise.allSettled([...monitors.values()].map((monitor) => monitor.promise));
}

fs.mkdirSync(path.join(resolveStateDir(), 'logs'), { recursive: true, mode: 0o700 });
logger.info('service starting');
reconcileAccounts();
const reconcileTimer = setInterval(reconcileAccounts, 10_000);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { void shutdown().finally(() => process.exit(0)); });
}
