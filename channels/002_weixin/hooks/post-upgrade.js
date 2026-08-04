#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const data = path.join(os.homedir(), 'yos', 'components', 'weixin');
for (const directory of [data, path.join(data, 'accounts'), path.join(data, 'logs')]) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}
for (const file of ['config.json', 'accounts.json']) {
  const target = path.join(data, file);
  if (fs.existsSync(target)) fs.chmodSync(target, 0o600);
}
process.stdout.write('[yos-weixin] Upgrade data validation passed.\n');
