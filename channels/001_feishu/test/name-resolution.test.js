import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyNameLookup, PERMISSION_DENIED_CODE } from '../src/lib/name-resolution.js';

// Regression (TD-128, measured against a live tenant on 2026-08-09): when the
// app lacks a contact scope, Feishu answers HTTP 200 / code 0 / msg "success"
// and simply omits the `name` field:
//
//     CONTACT: http=200 code=0 msg=success name=(none) user_id=(none)
//
// The old code had three branches (success-with-name, permission code 99991672,
// and the catch), so this outcome matched NONE of them and fell through to
// `return id` with no log line at all. Callers then printed the raw `ou_…`
// string as if it were a person's name. The bug was never "no name" — that is
// a customer-side permission setting — it was that nothing said so.

test('succeeded WITH a name resolves to that name', () => {
  const v = classifyNameLookup({ success: true, code: 0, user: { name: '苏白' } });
  assert.equal(v.name, '苏白');
  assert.equal(v.outcome, 'resolved');
  assert.equal(v.reason, null);
});

test('succeeded but NO name field is classified as empty, never as success', () => {
  // This is the exact shape the live API returned.
  const v = classifyNameLookup({ success: true, code: 0, message: 'success', user: {} });
  assert.equal(v.name, null, 'must not invent a name');
  assert.equal(v.outcome, 'empty');
  assert.ok(v.reason, 'an empty result MUST carry a reason the caller can log');
  assert.match(v.reason, /no name field/i);
});

test('succeeded with no user object at all is still classified as empty', () => {
  const v = classifyNameLookup({ success: true, code: 0 });
  assert.equal(v.name, null);
  assert.equal(v.outcome, 'empty');
  assert.ok(v.reason);
});

test('explicit permission denial keeps its own outcome and code', () => {
  const v = classifyNameLookup({ success: false, code: PERMISSION_DENIED_CODE, message: 'no permission' });
  assert.equal(v.name, null);
  assert.equal(v.outcome, 'permission-denied');
  assert.equal(v.permissionCode, PERMISSION_DENIED_CODE);
  assert.ok(v.reason);
});

test('any other failure is classified as failed, with the code in the reason', () => {
  const v = classifyNameLookup({ success: false, code: 1254043, message: 'user not found' });
  assert.equal(v.name, null);
  assert.equal(v.outcome, 'failed');
  assert.match(v.reason, /1254043/);
});

test('a missing/garbage result still produces a reason instead of silence', () => {
  for (const bad of [undefined, null, {}]) {
    const v = classifyNameLookup(bad);
    assert.equal(v.name, null);
    assert.ok(v.reason, `input ${JSON.stringify(bad)} must still explain itself`);
  }
});

// The core guarantee, stated once as a rule rather than per-case: the ONLY way
// to get a name back is for the API to have actually returned one. Everything
// else must hand the caller a reason to log.
test('every non-resolved outcome carries a reason (no silent fallback path)', () => {
  const inputs = [
    { success: true, code: 0, user: {} },
    { success: true, code: 0 },
    { success: false, code: PERMISSION_DENIED_CODE },
    { success: false, code: 999 },
    undefined,
  ];
  for (const input of inputs) {
    const v = classifyNameLookup(input);
    assert.equal(v.name, null);
    assert.ok(
      typeof v.reason === 'string' && v.reason.length > 0,
      `silent fallback reintroduced for input ${JSON.stringify(input)}`
    );
  }
});

// ------------------------------------------------------------------
// The fallback must announce itself (round 2)
//
// Round 1 put a warnNameFallback() call at the call site in index.js. Deliberate
// sabotage on 2026-08-09 — deleting that one line — passed the whole suite:
// nothing tied the fallback VALUE to the fallback NOTICE. So the notice moved
// into resolveDisplayName(), which is now the only way to obtain the fallback
// name at all, and the tests below assert that pairing directly.
// ------------------------------------------------------------------

import { resolveDisplayName, createFallbackNotice, NAME_FALLBACK_COOLDOWN_MS } from '../src/lib/name-resolution.js';

function makeSink(now = () => 0) {
  const lines = [];
  return {
    lines,
    notice: createFallbackNotice({ now }),
    emit: (line) => lines.push(line),
  };
}

test('a resolved name is returned and says nothing — no noise on the happy path', () => {
  const sink = makeSink();
  const out = resolveDisplayName({ success: true, code: 0, user: { name: '苏白' } }, 'ou_abc', sink);
  assert.equal(out.name, '苏白');
  assert.equal(out.resolved, true);
  assert.deepEqual(sink.lines, [], 'a successful lookup must not log anything');
});

test('THE BUG: every unresolved outcome falls back to the id AND says why', () => {
  // One case per branch of classifyNameLookup. Silence in ANY of them is TD-128.
  const cases = [
    ['empty (code 0, no name field)', { success: true, code: 0, message: 'success', user: {} }],
    ['permission denied', { success: false, code: PERMISSION_DENIED_CODE, message: 'no permission' }],
    ['outright failure', { success: false, code: 1254005, message: 'invalid id' }],
    ['nothing at all', undefined],
  ];

  for (const [label, result] of cases) {
    const sink = makeSink();
    const out = resolveDisplayName(result, 'ou_f60bfb3db0d4155f191269e5967caa88', sink);

    assert.equal(out.name, 'ou_f60bfb3db0d4155f191269e5967caa88', `${label}: must fall back to the raw id`);
    assert.equal(out.resolved, false, `${label}: must not claim it resolved`);
    assert.equal(sink.lines.length, 1, `${label}: a silent fallback is the bug — it must say why`);
    assert.match(sink.lines[0], /ou_f60bfb3db0d4155f191269e5967caa88/, `${label}: the notice must name the id`);
    assert.match(sink.lines[0], /contact/i, `${label}: the notice must say how to fix it`);
  }
});

test('the notice is rate-limited, not repeated per message', () => {
  // A missing scope stays missing; one line every 30 minutes, not one per chat.
  let clock = 1_000_000;
  const sink = makeSink(() => clock);
  const empty = { success: true, code: 0, user: {} };

  resolveDisplayName(empty, 'ou_abc', sink);
  assert.equal(sink.lines.length, 1, 'the first miss must speak up');

  for (let i = 0; i < 50; i++) {
    clock += 1000;
    resolveDisplayName(empty, 'ou_abc', sink);
  }
  assert.equal(sink.lines.length, 1, 'it must not repeat while cooling down');

  clock += NAME_FALLBACK_COOLDOWN_MS + 1;
  resolveDisplayName(empty, 'ou_abc', sink);
  assert.equal(sink.lines.length, 2, 'after the cooldown it must speak again — not go silent forever');
});

test('rate limiting never changes the name that gets used', () => {
  // Guard against "fix" the cooldown by returning early before the fallback.
  let clock = 0;
  const sink = makeSink(() => clock);
  const empty = { success: true, code: 0, user: {} };
  resolveDisplayName(empty, 'ou_abc', sink);
  clock += 1;
  const quiet = resolveDisplayName(empty, 'ou_abc', sink);
  assert.equal(quiet.name, 'ou_abc', 'a cooled-down call still returns the fallback id');
  assert.equal(quiet.resolved, false);
});

test('index.js cannot reach the fallback by going around the notice', () => {
  // Mechanical floor. classifyNameLookup() is the raw verdict WITHOUT the
  // notice; calling it from the message path is how the silent fallback comes
  // back. The call site must use resolveDisplayName(), which always announces.
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.equal(
    /\bclassifyNameLookup\s*\(/.test(src),
    false,
    'index.js must resolve names via resolveDisplayName(), not classifyNameLookup() — ' +
    'the classifier alone returns a verdict with no log line, which is TD-128'
  );
  assert.match(src, /resolveDisplayName\s*\(/, 'index.js must call resolveDisplayName()');
  assert.match(
    src,
    /emit:\s*\(line\)\s*=>\s*console\.log\(line\)/,
    'the notice sink must actually write the line (an empty emit re-silences the fallback)'
  );
});
