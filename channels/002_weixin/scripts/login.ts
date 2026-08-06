#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import {
  clearStaleAccountsForUserId,
  clearWeixinAccount,
  DEFAULT_BASE_URL,
  listIndexedWeixinAccountIds,
  loadWeixinAccount,
  registerWeixinAccountId,
  saveWeixinAccount,
  unregisterWeixinAccountId,
} from '../src/auth/accounts.ts';
import { displayQRCode, startWeixinLoginWithQr, waitForWeixinLogin, readLoginTimeoutMs } from '../src/auth/login-qr.ts';

function restartService(): void {
  spawnSync('pm2', ['restart', 'yos-weixin'], { stdio: 'ignore' });
}

async function login(): Promise<void> {
  const started = await startWeixinLoginWithQr({ apiBaseUrl: DEFAULT_BASE_URL, force: true });
  if (!started.qrcodeUrl) throw new Error('weixin_qr_unavailable');
  process.stdout.write(`${started.message}\n`);
  await displayQRCode(started.qrcodeUrl);
  const result = await waitForWeixinLogin({
    sessionKey: started.sessionKey,
    apiBaseUrl: DEFAULT_BASE_URL,
    timeoutMs: readLoginTimeoutMs(),   // 单一出处见 login-qr.ts；不许在这里写字面量
  });
  if (result.alreadyConnected) {
    process.stdout.write(`${result.message}\n`);
    return;
  }
  if (!result.connected || !result.botToken || !result.accountId) throw new Error('weixin_login_failed');
  if (result.userId) clearStaleAccountsForUserId(result.accountId, result.userId);
  saveWeixinAccount(result.accountId, {
    token: result.botToken,
    baseUrl: result.baseUrl || DEFAULT_BASE_URL,
    userId: result.userId,
  });
  registerWeixinAccountId(result.accountId);
  restartService();
  process.stdout.write(`微信已连接，账号 ${result.accountId}。\n`);
}

function status(): void {
  const ids = listIndexedWeixinAccountIds();
  if (ids.length === 0) {
    process.stdout.write('未连接微信账号。\n');
    return;
  }
  for (const id of ids) {
    const account = loadWeixinAccount(id);
    process.stdout.write(`${id}: ${account?.token ? 'configured' : 'missing credential'}\n`);
  }
}

function logout(accountId: string | undefined): void {
  const targets = accountId ? [accountId] : listIndexedWeixinAccountIds();
  for (const id of targets) {
    clearWeixinAccount(id);
    unregisterWeixinAccountId(id);
  }
  restartService();
  process.stdout.write(`已移除 ${targets.length} 个微信账号。\n`);
}

const [command = 'login', argument] = process.argv.slice(2);
try {
  if (command === 'login') await login();
  else if (command === 'status') status();
  else if (command === 'logout') logout(argument);
  else throw new Error('usage: yos-weixin <login|status|logout> [account-id]');
} catch (error) {
  const message = error instanceof Error ? error.message : 'weixin_command_failed';
  process.stderr.write(`[weixin] ${message}\n`);
  process.exitCode = 1;
}
