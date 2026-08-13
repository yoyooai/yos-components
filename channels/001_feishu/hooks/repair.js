#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  installLarkCliBinary,
  installLarkCliSkills,
  requireMinCoreVersion,
  syncCredentialsToLarkCli,
} from './post-install-shared.js';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  requireMinCoreVersion();
  installLarkCliBinary();
  await installLarkCliSkills(SKILL_DIR);
  syncCredentialsToLarkCli();
  console.log('[yos-feishu] component integrity verified');
} catch (error) {
  const code = error?.code || 'feishu_component_repair_failed';
  console.error(`[${code}] ${error?.message || 'Feishu component repair failed.'}`);
  if (error?.remediation) console.error(error.remediation);
  process.exitCode = 1;
}
