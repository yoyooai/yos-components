import fs from 'node:fs';
import path from 'node:path';

import { resolveStateDir } from '../storage/state-dir.ts';

export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
export const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';

export function normalizeWeixinBaseUrl(value: string): string {
  const parsed = new URL(value);
  const allowedHost = parsed.hostname === 'weixin.qq.com' || parsed.hostname.endsWith('.weixin.qq.com');
  if (
    parsed.protocol !== 'https:' || parsed.username || parsed.password ||
    parsed.search || parsed.hash || !allowedHost
  ) throw new Error('invalid_weixin_api_origin');
  parsed.pathname = parsed.pathname.replace(/\/$/, '');
  return parsed.toString().replace(/\/$/, '');
}

export type WeixinAccountData = {
  token?: string;
  savedAt?: string;
  baseUrl?: string;
  userId?: string;
};

function ensurePrivateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

function atomicWrite(filePath: string, value: unknown): void {
  ensurePrivateDirectory(path.dirname(filePath));
  const temporary = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, 0o600);
}

export function resolveAccountStorageName(accountId: string): string {
  if (!/^[A-Za-z0-9@._-]{1,200}$/.test(accountId)) throw new Error('invalid_weixin_account_id');
  return accountId;
}

function accountsDirectory(): string {
  return path.join(resolveStateDir(), 'accounts');
}

function accountPath(accountId: string): string {
  return path.join(accountsDirectory(), `${resolveAccountStorageName(accountId)}.json`);
}

function indexPath(): string {
  return path.join(resolveStateDir(), 'accounts.json');
}

export function listIndexedWeixinAccountIds(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath(), 'utf8'));
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && /^[A-Za-z0-9@._-]{1,200}$/.test(value))
      : [];
  } catch {
    return [];
  }
}

export function registerWeixinAccountId(accountId: string): void {
  resolveAccountStorageName(accountId);
  const existing = listIndexedWeixinAccountIds();
  if (!existing.includes(accountId)) atomicWrite(indexPath(), [...existing, accountId]);
}

export function unregisterWeixinAccountId(accountId: string): void {
  const existing = listIndexedWeixinAccountIds();
  atomicWrite(indexPath(), existing.filter((value) => value !== accountId));
}

export function loadWeixinAccount(accountId: string): WeixinAccountData | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(accountPath(accountId), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveWeixinAccount(accountId: string, update: WeixinAccountData): void {
  const existing = loadWeixinAccount(accountId) ?? {};
  const token = update.token?.trim() || existing.token;
  const baseUrl = normalizeWeixinBaseUrl(update.baseUrl?.trim() || existing.baseUrl || DEFAULT_BASE_URL);
  const userId = update.userId?.trim() || existing.userId;
  atomicWrite(accountPath(accountId), {
    ...(token ? { token, savedAt: new Date().toISOString() } : {}),
    baseUrl,
    ...(userId ? { userId } : {}),
  });
}

export function clearWeixinAccount(accountId: string): void {
  const prefix = path.join(accountsDirectory(), resolveAccountStorageName(accountId));
  for (const suffix of ['.json', '.sync.json', '.context-tokens.json']) {
    try { fs.unlinkSync(`${prefix}${suffix}`); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export function clearStaleAccountsForUserId(currentAccountId: string, userId: string): void {
  for (const accountId of listIndexedWeixinAccountIds()) {
    if (accountId !== currentAccountId && loadWeixinAccount(accountId)?.userId === userId) {
      clearWeixinAccount(accountId);
      unregisterWeixinAccountId(accountId);
    }
  }
}

export function loadConfigBotAgent(): string | undefined {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(resolveStateDir(), 'config.json'), 'utf8'));
    return typeof config.botAgent === 'string' ? config.botAgent : 'YOS/0.1.0-alpha.1';
  } catch {
    return 'YOS/0.1.0-alpha.1';
  }
}

export function loadConfigRouteTag(): string | undefined {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(resolveStateDir(), 'config.json'), 'utf8'));
    return typeof config.routeTag === 'string' ? config.routeTag : undefined;
  } catch {
    return undefined;
  }
}

export function deriveRawAccountId(): undefined {
  return undefined;
}
