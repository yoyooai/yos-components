import crypto from 'node:crypto';
import fs from 'node:fs';

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

export function loadApprovedTestBaselines(filePath) {
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`could not read test baselines: ${error.message}`);
  }
  if (policy.version !== 1 || !policy.baselines || typeof policy.baselines !== 'object') {
    throw new Error('test baselines have an unsupported schema');
  }
  for (const [name, baseline] of Object.entries(policy.baselines)) {
    requireNonNegativeInteger(baseline?.minimumPassed, `${name}.minimumPassed`);
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(policy.baselines)).digest('hex');
  if (digest !== policy.approvedDigest) {
    throw new Error(`test baseline approval digest mismatch: expected ${policy.approvedDigest}, got ${digest}`);
  }
  return policy.baselines;
}

export function parseTapSummary(output) {
  const fields = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  const values = {};
  for (const field of fields) {
    const matches = [...String(output).matchAll(new RegExp(`^# ${field} (\\d+)\\s*$`, 'gm'))];
    if (matches.length === 0) throw new Error(`missing TAP summary field: ${field}`);
    values[field] = Number(matches.at(-1)[1]);
  }
  return {
    tests: values.tests,
    passed: values.pass,
    failed: values.fail,
    cancelled: values.cancelled,
    skipped: values.skipped,
    todo: values.todo,
  };
}

export function verifyTapResult(output, baseline, label) {
  const summary = parseTapSummary(output);
  if (summary.passed < baseline.minimumPassed) {
    throw new Error(`${label} passed ${summary.passed} tests, below approved minimum ${baseline.minimumPassed}`);
  }
  if (summary.failed || summary.cancelled || summary.skipped || summary.todo) {
    throw new Error(`${label} contains non-passing tests: failed ${summary.failed}, cancelled ${summary.cancelled}, skipped ${summary.skipped}, todo ${summary.todo}`);
  }
  return summary.passed;
}
