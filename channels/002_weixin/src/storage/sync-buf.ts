import fs from 'node:fs';
import path from 'node:path';

import { resolveAccountStorageName } from '../auth/accounts.ts';
import { resolveStateDir } from './state-dir.ts';

export function getSyncBufFilePath(accountId: string): string {
  return path.join(resolveStateDir(), 'accounts', `${resolveAccountStorageName(accountId)}.sync.json`);
}

export function loadGetUpdatesBuf(filePath: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof parsed.get_updates_buf === 'string' ? parsed.get_updates_buf : undefined;
  } catch {
    return undefined;
  }
}

export function saveGetUpdatesBuf(filePath: string, getUpdatesBuf: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify({ get_updates_buf: getUpdatesBuf }), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  fs.chmodSync(filePath, 0o600);
}
