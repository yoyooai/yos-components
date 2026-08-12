#!/usr/bin/env node
/**
 * Post-install hook for yos-feishu
 *
 * Called during installation (both terminal and JSON/Claude modes).
 * Terminal mode (stdio: inherit): runs interactive prompts for config.
 * JSON mode (stdio: pipe): runs silently, skips interactive prompts.
 *
 * This hook handles feishu-specific setup:
 * - Create subdirectories (logs, media)
 * - Create default config.json
 * - Check for environment variables (informational)
 * - Prompt for connection mode and related config (terminal mode only)
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import {
  requireMinCoreVersion,
  installLarkCliBinary,
  installLarkCliSkills,
  mayAskInteractively,
  syncCredentialsToLarkCli,
} from './post-install-shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');

const HOME = process.env.HOME;
const DATA_DIR = path.join(HOME, 'yos/components/feishu');
const ENV_FILE = path.join(HOME, 'yos/.env');

// Minimal initial config - full defaults are in src/lib/config.js
const INITIAL_CONFIG = {
  enabled: true,
  connection_mode: 'websocket',
  webhook_port: 3458,
  message: { useMarkdownCard: true }
};

const isInteractive = mayAskInteractively();

function writePrivateConfig(config) {
  const configPath = path.join(DATA_DIR, 'config.json');
  const tempPath = `${configPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.renameSync(tempPath, configPath);
    fs.chmodSync(configPath, 0o600);
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
}

/**
 * Prompt user for input (only works in terminal mode).
 */
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

console.log('[post-install] Running feishu-specific setup...\n');

// 1. Create subdirectories
console.log('Creating subdirectories...');
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
fs.chmodSync(DATA_DIR, 0o700);
fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(DATA_DIR, 'media'), { recursive: true, mode: 0o700 });
console.log('  - logs/');
console.log('  - media/');

// 2. Create default config if not exists
const configPath = path.join(DATA_DIR, 'config.json');
if (!fs.existsSync(configPath)) {
  console.log('\nCreating default config.json...');
  writePrivateConfig(INITIAL_CONFIG);
  console.log('  - config.json created');
} else {
  fs.chmodSync(configPath, 0o600);
  console.log('\nConfig already exists, skipping.');
}

// 3. Check environment variables (informational)
console.log('\nChecking environment variables...');
let envContent = '';
try {
  envContent = fs.readFileSync(ENV_FILE, 'utf8');
} catch (e) {}

const hasAppId = envContent.includes('FEISHU_APP_ID');
const hasAppSecret = envContent.includes('FEISHU_APP_SECRET');

if (!hasAppId || !hasAppSecret) {
  console.log('  FEISHU_APP_ID and/or FEISHU_APP_SECRET not yet in .env.');
} else {
  console.log('  Credentials found.');
}

// 4. Connection mode and related config (terminal mode only)
if (isInteractive) {
  console.log('\nConnection Mode:');
  console.log('  1) websocket - Feishu SDK long connection (simpler, no public URL needed)');
  console.log('  2) webhook   - HTTP webhook (requires public URL + Caddy route)');
  const modeAnswer = await ask('\nChoose mode [1/2, default 1]: ');
  const mode = modeAnswer === '2' ? 'webhook' : 'websocket';

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.connection_mode = mode;

  if (mode === 'webhook') {
    // Verification token is required for webhook mode
    const token = await ask('\n  Verification Token (REQUIRED, from Event Subscriptions page): ');
    if (token) {
      config.bot = config.bot || {};
      config.bot.verification_token = token;
      console.log('  Verification token saved.');
    } else {
      console.log('  WARNING: Verification token is required for webhook mode.');
      console.log('  You must set bot.verification_token in config.json before starting.');
    }

    const encryptKey = await ask('  Encrypt Key (optional, for payload encryption) [press Enter to skip]: ');
    if (encryptKey) {
      config.bot = config.bot || {};
      config.bot.encrypt_key = encryptKey;
      console.log('  Encrypt key saved.');
    }
  }

  writePrivateConfig(config);
  console.log(`\n  Connection mode set to: ${mode}`);
} else {
  // Silence here is what an unattended install used to get: a connection mode
  // was chosen for the customer and never mentioned, so a machine that needed
  // webhook looked identical to one that wanted websocket. Say what was picked
  // and where to change it.
  console.log('\nConnection Mode:');
  console.log(`  Using the default (${INITIAL_CONFIG.connection_mode}) — not asking, because this install is non-interactive.`);
  console.log(`  To use webhook instead, set connection_mode in ${path.join(DATA_DIR, 'config.json')} and run: yos restart feishu`);
}

// 5. lark-cli integration (idempotent — safe to re-run on reinstall)
//
// lark-cli is an add-on: it powers the Feishu productivity surfaces (documents,
// sheets, Base, calendar, tasks, mail, drive, wiki). Messaging — the channel
// itself — does not need it. It is also the part most likely to fail on a
// customer machine: it installs globally with npm and reaches GitHub for its
// own assets.
//
// Exiting here used to abandon the rest of this hook, so a failure in the
// optional add-on cost the user the setup steps printed below — the ones they
// actually have to follow. Degrade, name what is unavailable, and carry on.
requireMinCoreVersion();
console.log('\nIntegrating lark-cli...');
let larkCliDegraded = false;
try {
  installLarkCliBinary();
  installLarkCliSkills(SKILL_DIR);
  syncCredentialsToLarkCli();
} catch (err) {
  larkCliDegraded = true;
  console.error(`\n  [${err.code || 'feishu_lark_cli_setup_failed'}] ${err.message}`);
  if (err.remediation) console.error(`  ${err.remediation}`);
  console.error('  The Feishu channel itself is unaffected — messages will send and receive.');
  console.error('  Unavailable until it is installed: documents, sheets, Base, calendar,');
  console.error('  tasks, mail, drive and wiki operations.');
  console.error('  To retry later, once npm can install globally on this machine:');
  console.error('    yos upgrade feishu');
}

// Note: PM2 service is started by Claude after this hook completes.

// Degrading and carrying on is deliberate — the add-on is optional and the
// setup steps printed below are the ones the user must actually follow. What
// was wrong was saying "Complete!" afterwards: an install that fetched none of
// the sub-skills ended on a success line, and `yos add` printed a green check
// over it. Report the degraded outcome and end non-zero so the caller can tell
// the two apart; the remaining steps are still printed either way.
if (larkCliDegraded) {
  console.log('\n[post-install] Finished with reduced functionality — the lark-cli add-on is not installed (reason above).');
} else {
  console.log('\n[post-install] Complete!');
}

// Read domain from yos config for webhook URL display
let webhookUrl = 'https://<your-domain>/feishu/webhook';
try {
  const yosConfig = JSON.parse(fs.readFileSync(path.join(HOME, 'yos/.yos/config.json'), 'utf8'));
  if (yosConfig.domain) {
    const protocol = yosConfig.protocol || 'https';
    webhookUrl = `${protocol}://${yosConfig.domain}/feishu/webhook`;
  }
} catch (e) {}

// Read the chosen mode for appropriate instructions
let chosenMode = 'websocket';
try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  chosenMode = config.connection_mode || 'websocket';
} catch (e) {}

console.log('\n========================================');
console.log('  Feishu (飞书) Setup — Remaining Steps');
console.log('========================================');
console.log('');
console.log('In the developer console: open.feishu.cn/app');
console.log('');
console.log('1. Enable "Bot" capability');
console.log('2. Subscribe to event: im.message.receive_v1');

if (chosenMode === 'webhook') {
  console.log(`3. Set subscription mode to "webhook"`);
  console.log(`4. Set Request URL: ${webhookUrl}`);
} else {
  console.log(`3. Set subscription mode to "长连接" (long connection / WebSocket)`);
}

console.log('');
console.log('First private message to the bot will auto-bind the sender as owner.');
console.log('========================================');

// Set only after the remaining-steps guide has been printed, so signalling the
// failure never costs the user the instructions they came for.
if (larkCliDegraded) {
  process.exitCode = 1;
}
