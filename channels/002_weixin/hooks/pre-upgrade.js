#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const data = path.join(os.homedir(), 'yos', 'components', 'weixin');
const config = path.join(data, 'config.json');
if (fs.existsSync(config)) JSON.parse(fs.readFileSync(config, 'utf8'));
process.stdout.write('[yos-weixin] Upgrade preflight passed; account data remains outside the package.\n');
