/**
 * Pure classifier: decide what a user-name lookup actually produced.
 *
 * Feishu applies permissions at the FIELD level. When the app lacks a contact
 * scope (e.g. `contact:user.base:readonly`), the API does NOT fail — it answers
 * HTTP 200 with `code: 0, msg: "success"` and simply OMITS `name`/`user_id`.
 * Measured against a live tenant on 2026-08-09:
 *
 *     CONTACT: http=200 code=0 msg=success name=(none) user_id=(none)
 *
 * The old call site had three branches — success-with-name, the one known
 * permission code (99991672), and the catch — so "succeeded but returned no
 * data" matched none of them and fell straight through to `return id`. The
 * caller then used the raw `ou_…` string as if it were a person's name, with
 * no log line anywhere. Nobody could tell a missing scope from a broken API.
 *
 * This function makes every outcome explicit, so the caller can always say
 * WHY it is about to fall back to the raw id.
 *
 * @param {object} [result] - Result from getUserInfo().
 * @param {boolean} [result.success] - Whether the call itself succeeded.
 * @param {number} [result.code] - Feishu response code.
 * @param {string} [result.message] - Feishu response message.
 * @param {object} [result.user] - User payload, when returned.
 * @param {string} [result.user.name] - Display name, when the scope allows it.
 * @returns {{name: string|null, outcome: string, reason: string|null, permissionCode: number|null}}
 *   `name` is non-null ONLY when a usable display name was actually returned.
 *   `outcome` is one of 'resolved' | 'empty' | 'permission-denied' | 'failed'.
 *   `reason` is a human-readable explanation for every non-resolved outcome.
 */
export function classifyNameLookup(result) {
  if (result && result.success && result.user && result.user.name) {
    return { name: result.user.name, outcome: 'resolved', reason: null, permissionCode: null };
  }

  // The known explicit permission error keeps its dedicated path so the caller
  // can keep notifying the owner with the grant URL.
  if (result && !result.success && result.code === PERMISSION_DENIED_CODE) {
    return {
      name: null,
      outcome: 'permission-denied',
      reason: `lookup denied by permission check (code ${result.code})`,
      permissionCode: result.code,
    };
  }

  // The case that used to vanish: the call worked, the data did not come back.
  if (result && result.success) {
    return {
      name: null,
      outcome: 'empty',
      reason:
        'lookup succeeded (code 0) but returned no name field — the app most ' +
        'likely lacks a contact read scope, which Feishu reports by omitting ' +
        'the field rather than by failing',
      permissionCode: null,
    };
  }

  const code = result && result.code !== undefined && result.code !== null ? result.code : 'unknown';
  const msg = result && result.message ? `: ${result.message}` : '';
  return {
    name: null,
    outcome: 'failed',
    reason: `lookup failed with code ${code}${msg}`,
    permissionCode: null,
  };
}

/** Feishu's explicit "app has no permission" code. */
export const PERMISSION_DENIED_CODE = 99991672;

/** How long to stay quiet after saying a name could not be resolved. */
export const NAME_FALLBACK_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Build the rate limiter for the "falling back to the raw id" notice.
 *
 * A missing scope is a persistent condition, so the notice is worth saying
 * once in a while, not once per message.
 *
 * @param {object} [options] - Overrides, for tests.
 * @param {number} [options.cooldownMs] - Quiet period after a notice.
 * @param {Function} [options.now] - Clock, returning epoch ms.
 * @returns {(id: string, reason: string) => string|null} Notice text, or null while cooling down.
 */
export function createFallbackNotice({ cooldownMs = NAME_FALLBACK_COOLDOWN_MS, now = Date.now } = {}) {
  let last = null;
  return function noticeFor(id, reason) {
    const t = now();
    if (last !== null && t - last < cooldownMs) return null;
    last = t;
    return (
      `[feishu] Falling back to the raw id for ${id} — no display name available (${reason}). ` +
      'Grant the app a contact read scope (e.g. contact:user.base:readonly) to show real names.'
    );
  };
}

/**
 * Decide the display name AND announce it when the real name could not be had.
 *
 * The announcement lives here, not at the call site, on purpose. TD-128 was a
 * SILENT fallback: the caller returned the raw `ou_…` id and said nothing, so
 * "why is this person's name a string of gibberish" had no answer anywhere in
 * the logs. Putting the notice in the same function that produces the fallback
 * makes the two inseparable — a caller cannot obtain the fallback name while
 * skipping the explanation, because there is only one way to get the name.
 *
 * @param {object} result - Result from getUserInfo().
 * @param {string} id - The id being resolved, used as the fallback name.
 * @param {object} sink - Where the notice goes.
 * @param {Function} sink.notice - Rate limiter from createFallbackNotice().
 * @param {Function} sink.emit - Writes a line to stdout (NOT stderr: nothing is broken).
 * @returns {{name: string, resolved: boolean, verdict: object}}
 *   `name` is the display name to use — the real one, or `id` as fallback.
 */
export function resolveDisplayName(result, id, { notice, emit }) {
  const verdict = classifyNameLookup(result);
  if (verdict.name) {
    return { name: verdict.name, resolved: true, verdict };
  }
  const line = notice(id, verdict.reason);
  if (line) emit(line);
  return { name: id, resolved: false, verdict };
}
