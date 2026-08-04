import os from 'node:os';
import path from 'node:path';

export function resolveStateDir(): string {
  return process.env.YOS_WEIXIN_DATA_DIR?.trim()
    || path.join(os.homedir(), 'yos', 'components', 'weixin');
}
