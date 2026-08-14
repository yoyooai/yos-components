#!/usr/bin/env node

import path from 'node:path';
import dotenv from 'dotenv';

import { getConfig, getCredentials } from '../src/lib/config.js';
import { buildHealthReport } from '../src/lib/health.js';

dotenv.config({ path: path.join(process.env.HOME, 'yos', '.env') });

try {
  const config = getConfig();
  const credentials = getCredentials();
  console.log(JSON.stringify(buildHealthReport({
    appId: credentials.app_id,
    connectionMode: config.connection_mode,
  })));
} catch {
  console.error('[FEISHU_HEALTH_READ_FAILED] Could not read the local Feishu channel identity.');
  process.exitCode = 1;
}
