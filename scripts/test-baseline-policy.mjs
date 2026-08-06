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
    // TD-84 (raised here first, fixed in the OS repo the same night): the floor
    // has to be raised whenever tests are added, or the new ones sit outside it
    // and can be deleted with the gate still green. That was a rule in a
    // document; documents do not fail builds. Declared here so it lands inside
    // the approval digest below and cannot be widened quietly.
    if (baseline.driftAllowance !== undefined) {
      requireNonNegativeInteger(baseline.driftAllowance, `${name}.driftAllowance`);
    }
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

export function verifyTapResult(output, baseline, label, key = label) {
  const summary = parseTapSummary(output);
  if (summary.passed < baseline.minimumPassed) {
    throw new Error(`${label} passed ${summary.passed} tests, below approved minimum ${baseline.minimumPassed}`);
  }
  if (summary.failed || summary.cancelled || summary.skipped || summary.todo) {
    throw new Error(`${label} contains non-passing tests: failed ${summary.failed}, cancelled ${summary.cancelled}, skipped ${summary.skipped}, todo ${summary.todo}`);
  }
  return assertBaselineIsCurrent(label, summary.passed, baseline, key);
}

/**
 * The floor has to keep up with reality.
 *
 * TD-84: `minimumPassed` is a floor, which is the right design — but it was
 * raised by hand, with one line in a process document asking people to remember.
 * Anyone adding tests and forgetting leaves those tests outside the floor: they
 * can be deleted and the gate stays green, which is the exact hole the floor
 * exists to close, reopened a few tests at a time.
 *
 * Passing MORE than the floor is therefore a failure too, and the message
 * carries the number to write down. The debt entry suggested making this
 * advisory; a hint nobody reads is how this debt survived in the first place.
 *
 * `driftAllowance` is the escape hatch for a suite whose count genuinely moves
 * between runs. It defaults to 0, lives inside the digest-locked baselines, and
 * cannot be widened without the approval digest changing.
 *
 * @param {string} label - human label, e.g. "Feishu tests"
 * @param {number} passed
 * @param {{ minimumPassed: number, driftAllowance?: number }} baseline
 * @param {string} [key] - the baselines key to edit, e.g. "feishu". Defaults to
 *   label, but the two differ in this repo ("Feishu tests" vs "feishu"), and a
 *   repair instruction naming a key that does not exist is worse than none.
 * @returns {number} passed, so callers can chain
 */
export function assertBaselineIsCurrent(label, passed, baseline, key = label) {
  const floor = baseline.minimumPassed;
  const allowance = baseline.driftAllowance ?? 0;
  if (passed > floor + allowance) {
    throw new Error(
      `${label} passed ${passed} tests but the approved floor is ${floor}`
      + (allowance > 0 ? ` (+${allowance} allowed drift)` : '')
      + `. Tests were added without raising the floor, so the new ones are not protected by it: `
      + `set baselines.${key}.minimumPassed to ${passed} in scripts/test-baselines.json `
      + `and refresh approvedDigest.`
    );
  }
  return passed;
}
