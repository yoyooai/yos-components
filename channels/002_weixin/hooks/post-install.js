#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const data = path.join(os.homedir(), 'yos', 'components', 'weixin');
const accounts = path.join(data, 'accounts');
const logs = path.join(data, 'logs');
for (const directory of [data, accounts, logs]) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}
const config = path.join(data, 'config.json');
if (!fs.existsSync(config)) {
  fs.writeFileSync(config, JSON.stringify({ enabled: true, botAgent: 'YOS/0.1.0-alpha.1' }, null, 2), { mode: 0o600 });
}
fs.chmodSync(config, 0o600);
process.stdout.write('[yos-weixin] Installed. Run `yos-weixin login` in a terminal to connect Weixin.\n');
