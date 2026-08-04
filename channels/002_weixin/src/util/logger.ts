import fs from 'node:fs';
import path from 'node:path';

import { resolveStateDir } from '../storage/state-dir.ts';

export type Logger = {
  info(message: string): void;
  debug(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  withAccount(accountId: string): Logger;
};

function safe(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\/Users\/[^\s"']+/g, '[PRIVATE_PATH]')
    .replace(/\/home\/[^\s"']+/g, '[PRIVATE_PATH]');
}

function write(level: string, message: string, accountId?: string): void {
  const logs = path.join(resolveStateDir(), 'logs');
  try {
    fs.mkdirSync(logs, { recursive: true, mode: 0o700 });
    fs.chmodSync(logs, 0o700);
    fs.appendFileSync(
      path.join(logs, 'weixin.log'),
      `${JSON.stringify({ time: new Date().toISOString(), level, accountId, message: safe(message) })}\n`,
      { mode: 0o600 },
    );
  } catch {
    // Logging must not interrupt message delivery.
  }
  const prefix = accountId ? `[weixin:${accountId}]` : '[weixin]';
  const output = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  output(`${prefix} ${safe(message)}`);
}

function create(accountId?: string): Logger {
  return {
    info: (message) => write('INFO', message, accountId),
    debug: (message) => { if (process.env.YOS_WEIXIN_DEBUG === '1') write('DEBUG', message, accountId); },
    warn: (message) => write('WARN', message, accountId),
    error: (message) => write('ERROR', message, accountId),
    withAccount: (nextAccountId) => create(nextAccountId),
  };
}

export const logger = create();
