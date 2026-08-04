#!/usr/bin/env node
/**
 * Shared helpers for post-install and post-upgrade hooks.
 *
 * Four exported functions:
 *   0. requireMinCoreVersion()          - guard: YOS Core > MIN_CORE_VERSION
 *   1. installLarkCliBinary()           - probe + version check + install/upgrade
 *   2. installLarkCliSkills(skillDir)   - probe + version check + install/upgrade
 *   3. syncCredentialsToLarkCli(opts)   - read ~/yos/.env, delegate to
 *                                          `lark-cli config init --app-secret-stdin`
 *
 * The target lark-cli version is read from package.json `larkCli.version`,
 * falling back to a hardcoded minimum for backward compatibility with
 * package.json files that predate the `larkCli` field.
 *
 * Each function throws on failure; the caller decides whether to abort.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { parse as parseDotenv } from 'dotenv';
import { fileURLToPath } from 'url';

const MIN_CORE_VERSION = '0.1.0-alpha.1';
const MAX_CORE_VERSION = '0.2.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LARK_CLI_NPM_PACKAGE = '@larksuite/cli';
const FALLBACK_VERSION = '1.0.41';
const XC_SKILLS_SOURCE = 'https://github.com/larksuite/cli';
const EXPECTED_SUB_SKILLS = Object.freeze([
  'lark-apps',
  'lark-approval',
  'lark-attendance',
  'lark-base',
  'lark-calendar',
  'lark-contact',
  'lark-doc',
  'lark-drive',
  'lark-event',
  'lark-im',
  'lark-mail',
  'lark-markdown',
  'lark-minutes',
  'lark-note',
  'lark-okr',
  'lark-openapi-explorer',
  'lark-shared',
  'lark-sheets',
  'lark-skill-maker',
  'lark-slides',
  'lark-task',
  'lark-vc',
  'lark-vc-agent',
  'lark-whiteboard',
  'lark-wiki',
  'lark-workflow-meeting-summary',
  'lark-workflow-standup-report',
]);
const LARK_BRAND = 'feishu';
const DEFAULT_LARK_LANG = 'zh';
const DEFAULT_ENV_FILE = path.join(process.env.HOME || '', 'yos/.env');
const LOG_PREFIX = '[yos-feishu]';
const SKILLS_VERSION_FILE = '.lark-cli-version';

function semverCompare(a, b) {
  const parse = (value) => {
    const match = String(value).trim().match(
      /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
    );
    if (!match) return null;
    return {
      core: match.slice(1, 4).map(Number),
      prerelease: match[4] ? match[4].split('.') : [],
    };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i += 1) {
    if (pa.core[i] < pb.core[i]) return -1;
    if (pa.core[i] > pb.core[i]) return 1;
  }
  if (pa.prerelease.length === 0 || pb.prerelease.length === 0) {
    if (pa.prerelease.length === pb.prerelease.length) return 0;
    return pa.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    if (pa.prerelease[i] === undefined) return -1;
    if (pb.prerelease[i] === undefined) return 1;
    const aNumeric = /^\d+$/.test(pa.prerelease[i]);
    const bNumeric = /^\d+$/.test(pb.prerelease[i]);
    if (aNumeric && bNumeric) {
      const difference = Number(pa.prerelease[i]) - Number(pb.prerelease[i]);
      if (difference !== 0) return Math.sign(difference);
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else {
      const difference = pa.prerelease[i].localeCompare(pb.prerelease[i]);
      if (difference !== 0) return Math.sign(difference);
    }
  }
  return 0;
}

export function isCompatibleCoreVersion(version) {
  const minimum = semverCompare(version, MIN_CORE_VERSION);
  const maximum = semverCompare(version, MAX_CORE_VERSION);
  return minimum !== null && maximum !== null && minimum >= 0 && maximum < 0;
}

/**
 * Guard: abort if YOS Core is not installed or is too old.
 * Called by both post-install and post-upgrade hooks.
 */
export function requireMinCoreVersion() {
  let coreVersion = null;
  try {
    coreVersion = execFileSync('yos', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // not installed or not on PATH
  }
  if (!coreVersion) {
    console.error(
      `${LOG_PREFIX} requires YOS Core > ${MIN_CORE_VERSION}, but \`yos --version\` could not be read.`
    );
    console.error(
      `${LOG_PREFIX} Aborting to avoid a broken install. Please run: yos upgrade --self  (then retry).`
    );
    process.exit(1);
  }
  if (!isCompatibleCoreVersion(coreVersion)) {
    console.error(
      `${LOG_PREFIX} requires YOS Core >= ${MIN_CORE_VERSION} and < ${MAX_CORE_VERSION}, found ${coreVersion}.`
    );
    console.error(`${LOG_PREFIX} Please run: yos upgrade --self  (then retry).`);
    process.exit(1);
  }
}

function getTargetVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8')
    );
    return pkg.larkCli?.version || FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

function commandExists(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getInstalledVersion() {
  try {
    const out = execFileSync('lark-cli', ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = out.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Ensure the `lark-cli` binary is on PATH at the target version.
 */
export function installLarkCliBinary() {
  const target = getTargetVersion();
  const installed = getInstalledVersion();

  if (installed) {
    if (semverCompare(installed, target) >= 0) {
      console.log(`${LOG_PREFIX} lark-cli ${installed} >= target ${target}, skipping`);
      return;
    }
    console.log(`${LOG_PREFIX} lark-cli ${installed} < target ${target}, upgrading`);
  } else {
    console.log(`${LOG_PREFIX} lark-cli not found, installing ${target}`);
  }

  execFileSync('npm', ['install', '-g', `${LARK_CLI_NPM_PACKAGE}@${target}`], {
    stdio: 'inherit',
  });

  if (!commandExists('lark-cli')) {
    throw new Error(
      `lark-cli not found in PATH after npm install -g ${LARK_CLI_NPM_PACKAGE}@${target}`
    );
  }

  const newVersion = getInstalledVersion();
  console.log(`${LOG_PREFIX} lark-cli now at ${newVersion}`);
}

/**
 * Install or upgrade lark-cli's bundled Agent Skills into `<skillDir>/references/`.
 *
 * Triggers a (re-)install when:
 *   - Any sub-skill directory is missing (partial install / manual deletion)
 *   - The version marker file is absent (legacy install) or below target
 */
export function installLarkCliSkills(skillDir) {
  if (!skillDir) {
    throw new Error('installLarkCliSkills: skillDir is required');
  }
  const target = getTargetVersion();
  const bundlesDir = path.join(skillDir, 'references');
  fs.mkdirSync(bundlesDir, { recursive: true });

  const versionFile = path.join(bundlesDir, SKILLS_VERSION_FILE);

  const findMissing = () =>
    EXPECTED_SUB_SKILLS.filter(
      (name) => !fs.existsSync(path.join(bundlesDir, name, 'SKILL.md'))
    );

  let installedSkillsVersion = null;
  try {
    installedSkillsVersion = fs.readFileSync(versionFile, 'utf-8').trim();
  } catch { /* missing = needs install */ }

  const missing = findMissing();
  const needsVersionUpgrade =
    !installedSkillsVersion || semverCompare(installedSkillsVersion, target) < 0;

  if (missing.length === 0 && !needsVersionUpgrade) {
    console.log(
      `${LOG_PREFIX} all ${EXPECTED_SUB_SKILLS.length} sub-skills present at ${installedSkillsVersion}, skipping`
    );
    return;
  }

  if (needsVersionUpgrade) {
    console.log(
      `${LOG_PREFIX} sub-skills version ${installedSkillsVersion || '(none)'} → ${target}, upgrading`
    );
  }
  if (missing.length > 0) {
    console.log(
      `${LOG_PREFIX} ${missing.length}/${EXPECTED_SUB_SKILLS.length} sub-skill(s) missing, repairing`
    );
  }

  execFileSync('npx', [
    'xc-skills@latest',
    'add',
    `${XC_SKILLS_SOURCE}#v${target}`,
    '--out',
    bundlesDir,
    '-y',
  ], { stdio: 'inherit' });

  const stillMissing = findMissing();
  if (stillMissing.length > 0) {
    throw new Error(
      `installLarkCliSkills: still missing after install: ${stillMissing.join(', ')}`
    );
  }

  fs.writeFileSync(versionFile, target + '\n');
  console.log(`${LOG_PREFIX} sub-skills updated to ${target}`);
}

/**
 * Push FEISHU_APP_ID / FEISHU_APP_SECRET into lark-cli's keychain by delegating
 * to `lark-cli config init --app-secret-stdin`.
 *
 * Resolution order (first non-empty wins per field):
 *   appId / appSecret:
 *     1. opts.appId / opts.appSecret
 *     2. ~/yos/.env  (parsed via dotenv.parse, no side effects on process.env)
 *     3. process.env.FEISHU_APP_ID / FEISHU_APP_SECRET
 *   lang:
 *     1. opts.lang
 *     2. ~/yos/.env  FEISHU_LANG
 *     3. process.env.FEISHU_LANG
 *     4. fallback 'zh'
 *
 * If appId or appSecret cannot be resolved, logs a warning and returns
 * {skipped: true, reason: 'credentials_missing'} — does NOT throw.
 *
 * Secret is piped via stdin so it never appears in the process listing.
 */
export function syncCredentialsToLarkCli(opts = {}) {
  let { appId, appSecret, lang, envFile = DEFAULT_ENV_FILE } = opts;

  if (fs.existsSync(envFile)) {
    const parsed = parseDotenv(fs.readFileSync(envFile));
    appId = appId || parsed.FEISHU_APP_ID;
    appSecret = appSecret || parsed.FEISHU_APP_SECRET;
    lang = lang || parsed.FEISHU_LANG;
  }
  appId = appId || process.env.FEISHU_APP_ID;
  appSecret = appSecret || process.env.FEISHU_APP_SECRET;
  lang = lang || process.env.FEISHU_LANG || DEFAULT_LARK_LANG;

  if (!appId || !appSecret) {
    console.warn(
      `${LOG_PREFIX} FEISHU_APP_ID / FEISHU_APP_SECRET not found in ${envFile} ` +
      `or process.env; skipping lark-cli keychain sync. ` +
      `Add the variables to ${envFile} and re-run this hook (or 'yos upgrade feishu') to sync.`
    );
    return { skipped: true, reason: 'credentials_missing' };
  }

  execFileSync('lark-cli', [
    'config', 'init',
    '--app-id', appId,
    '--app-secret-stdin',
    '--brand', LARK_BRAND,
    '--name', LARK_BRAND,
    '--lang', lang,
  ], {
    input: appSecret + '\n',
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  console.log(`${LOG_PREFIX} synced App credentials to lark-cli (brand=${LARK_BRAND}, lang=${lang})`);

  return {
    appId,
    brand: LARK_BRAND,
    lang,
    configPath: path.join(process.env.HOME || '', '.lark-cli', 'config.json'),
    keychainID: `appsecret:${appId}`,
  };
}
