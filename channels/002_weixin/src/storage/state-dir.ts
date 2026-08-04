import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveStateDir(): string {
  return process.env.YOS_WEIXIN_DATA_DIR?.trim()
    || path.join(os.homedir(), 'yos', 'components', 'weixin');
}

export function ensurePrivateStateDir(): string {
  const directory = resolveStateDir();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  return directory;
}
