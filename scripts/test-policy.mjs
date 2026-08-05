import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadApprovedTestBaselines,
  verifyTapResult,
} from './test-baseline-policy.mjs';

const TEST_FILE = /(^|\/)(?:__tests__\/.*|tests?\/.*|[^/]+\.(?:test|spec))\.(?:[cm]?js|jsx|ts|tsx)$/;
const CONFIG_FILE = /(^|\/)(?:jest\.config\.[^/]+|package\.json|run-[^/]*tests?\.[^/]+)$/;
const DISABLED_CALL = /\b(describe|it|test)\s*\.\s*(skip|todo|only)\s*\(|\b(xdescribe|xit|xtest)\s*\(/g;
const JEST_IGNORE_PROPERTY = /\btestPathIgnorePatterns\s*:/g;
const JEST_IGNORE_JSON_PROPERTY = /"testPathIgnorePatterns"\s*:/g;
const JEST_IGNORE_CLI = /--testPathIgnorePatterns\b/g;
const ACTIVE_TEST = /\btest\s*\(/g;

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function stripCommentsAndStrings(source) {
  let result = '';
  let mode = 'code';
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (mode === 'line-comment') {
      if (char === '\n') {
        mode = 'code';
        result += '\n';
      } else result += ' ';
      continue;
    }
    if (mode === 'block-comment') {
      if (char === '*' && next === '/') {
        result += '  ';
        index += 1;
        mode = 'code';
      } else result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (mode === 'string') {
      if (char === '\\') {
        result += ' ';
        if (index + 1 < source.length) {
          index += 1;
          result += source[index] === '\n' ? '\n' : ' ';
        }
      } else if (char === quote) {
        result += ' ';
        mode = 'code';
      } else result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (char === '/' && next === '/') {
      result += '  ';
      index += 1;
      mode = 'line-comment';
    } else if (char === '/' && next === '*') {
      result += '  ';
      index += 1;
      mode = 'block-comment';
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
      result += ' ';
      mode = 'string';
    } else result += char;
  }
  return result;
}

export function findDisabledTests(files) {
  const findings = [];
  for (const file of files) {
    const normalizedPath = file.path.split(path.sep).join('/');
    const sanitized = stripCommentsAndStrings(file.source);
    if (TEST_FILE.test(normalizedPath)) {
      for (const match of sanitized.matchAll(DISABLED_CALL)) {
        findings.push({
          path: normalizedPath,
          line: lineNumberAt(file.source, match.index),
          kind: match[3] || `${match[1]}.${match[2]}`,
        });
      }
    }
    if (CONFIG_FILE.test(normalizedPath)) {
      for (const match of sanitized.matchAll(JEST_IGNORE_PROPERTY)) {
        findings.push({ path: normalizedPath, line: lineNumberAt(file.source, match.index), kind: 'testPathIgnorePatterns' });
      }
      if (normalizedPath.endsWith('package.json')) {
        for (const match of file.source.matchAll(JEST_IGNORE_JSON_PROPERTY)) {
          findings.push({ path: normalizedPath, line: lineNumberAt(file.source, match.index), kind: 'testPathIgnorePatterns' });
        }
      }
      for (const match of file.source.matchAll(JEST_IGNORE_CLI)) {
        findings.push({ path: normalizedPath, line: lineNumberAt(file.source, match.index), kind: '--testPathIgnorePatterns' });
      }
    }
  }
  return findings;
}

function loadAllowlist(filePath) {
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`could not read skip allowlist: ${error.message}`);
  }
  if (policy.version !== 1 || !Array.isArray(policy.entries)) {
    throw new Error('skip allowlist has an unsupported schema');
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(policy.entries)).digest('hex');
  if (digest !== policy.approvedDigest) throw new Error('skip allowlist approval digest mismatch');
  for (const entry of policy.entries) {
    if (!entry.path || !Number.isInteger(entry.line) || !entry.kind || !entry.reason || !entry.proposer) {
      throw new Error('each skip allowlist entry requires path, line, kind, reason, and proposer');
    }
  }
  return policy.entries;
}

function trackedFiles(root, gitCommand) {
  if (!fs.existsSync(path.join(root, '.git'))) throw new Error('Git worktree is required for test-policy verification');
  const result = spawnSync(gitCommand, ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`could not list tracked files for test-policy verification: ${result.error?.message || result.stderr?.trim() || result.status}`);
  }
  const files = result.stdout.split('\0').filter(Boolean);
  if (files.length === 0) throw new Error('Git returned no tracked files for test-policy verification');
  return files;
}

function countActiveTests(source) {
  return [...stripCommentsAndStrings(source).matchAll(ACTIVE_TEST)].length;
}

export function verifyCriticalTestFiles(root, manifest) {
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('critical test manifest has an unsupported or empty schema');
  }
  for (const entry of manifest.files) {
    const filePath = path.join(root, entry.path);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`missing critical file: ${entry.path}`);
    }
    if (entry.minimumTests !== undefined) {
      const count = countActiveTests(fs.readFileSync(filePath, 'utf8'));
      if (count < entry.minimumTests) {
        throw new Error(`${entry.path}: expected at least ${entry.minimumTests} test case, found ${count}`);
      }
    }
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`could not read ${label}: ${error.message}`);
  }
}

function mustReject(label, operation) {
  try {
    operation();
  } catch {
    return;
  }
  throw new Error(`${label} did not reject a below-baseline result`);
}

export function verifyTestBaselineGuard(root) {
  const baselines = loadApprovedTestBaselines(path.join(root, 'scripts', 'test-baselines.json'));
  for (const [id, baseline] of Object.entries(baselines)) {
    mustReject(`${id} baseline guard`, () => verifyTapResult([
      `# tests ${baseline.minimumPassed}`,
      `# pass ${Math.max(0, baseline.minimumPassed - 1)}`,
      '# fail 0',
      '# cancelled 0',
      '# skipped 0',
      '# todo 0',
    ].join('\n'), baseline, id));
  }

  const verifySource = fs.readFileSync(path.join(root, 'scripts', 'verify.mjs'), 'utf8');
  const gateReturnIndex = /^\s*return runTestSuitesImpl\(\{\s*$/m.exec(verifySource)?.index ?? -1;
  const legacyVerdictIndex = /^\s*return verifyRecordedTestCountsImpl\(counts, testSuites, testBaselines\) === counts;\s*$/m.exec(verifySource)?.index ?? -1;
  const runIndex = verifySource.indexOf('export function runVerification({');
  const runSource = runIndex >= 0 ? verifySource.slice(runIndex) : '';
  const decisionStart = runSource.indexOf('let failed = false;');
  const decisionSource = decisionStart >= 0 ? runSource.slice(decisionStart) : runSource;
  const declarationIndex = /^\s*let counts = null;\s*$/m.exec(decisionSource)?.index ?? -1;
  const tryIndex = /^\s*try \{\s*$/m.exec(decisionSource)?.index ?? -1;
  const gateIndex = /^\s*counts = executeTestGateImpl\(\{\s*$/m.exec(decisionSource)?.index ?? -1;
  const catchIndex = /^\s*\} catch \(error\) \{\s*$/m.exec(decisionSource)?.index ?? -1;
  const validatorIndex = /^\s*verifyRecordedTestCountsImpl\(counts, testSuites, approvedBaselines\);\s*$/m.exec(decisionSource)?.index ?? -1;
  const stepsIndex = decisionSource.indexOf('for (const [label, command, args] of steps)');
  if (legacyVerdictIndex >= 0) {
    throw new Error('executed-test gate must return raw counts');
  }
  if (gateReturnIndex < 0 || gateIndex < 0) {
    throw new Error('executed-test gate is missing from channel verification');
  }
  if (validatorIndex < 0) {
    throw new Error('executed-test count validator is missing from channel verification');
  }
  if (tryIndex < 0 || declarationIndex < 0 || declarationIndex > tryIndex) {
    throw new Error('executed-test verification state must be declared before the verification try block');
  }
  if (catchIndex < 0 || validatorIndex < catchIndex) {
    throw new Error('executed-test count validator must be enforced after the verification catch block');
  }
  if (stepsIndex < 0 || gateIndex < tryIndex || gateIndex > catchIndex) {
    throw new Error('executed-test gate must run before audits and packaging');
  }
  if (validatorIndex > stepsIndex) {
    throw new Error('executed-test gate must run before audits and packaging');
  }
}

export function verifyTestPolicy({
  root,
  gitCommand = 'git',
  allowlistPath = path.join(root, 'scripts', 'test-skip-allowlist.json'),
  criticalManifestPath = path.join(root, 'scripts', 'critical-test-files.json'),
} = {}) {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error('test-policy scan root is missing');
  }
  const scanPaths = trackedFiles(root, gitCommand)
    .filter((file) => TEST_FILE.test(file) || CONFIG_FILE.test(file));
  if (scanPaths.length === 0) throw new Error('test-policy scan found no tracked test or configuration files');
  verifyCriticalTestFiles(root, readJson(criticalManifestPath, 'critical test manifest'));
  const findings = findDisabledTests(scanPaths.map((file) => ({
    path: file,
    source: fs.readFileSync(path.join(root, file), 'utf8'),
  })));
  const allowed = new Set(loadAllowlist(allowlistPath)
    .map((entry) => `${entry.path}:${entry.line}:${entry.kind}`));
  const blocked = findings.filter((entry) => !allowed.has(`${entry.path}:${entry.line}:${entry.kind}`));
  if (blocked.length > 0) {
    throw new Error(`disabled or focused tests are forbidden:\n${blocked
      .map((entry) => `${entry.path}:${entry.line} ${entry.kind}`)
      .join('\n')}`);
  }
  verifyTestBaselineGuard(root);
  return { scannedFiles: scanPaths.length };
}
