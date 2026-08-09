/**
 * Route Feishu SDK log lines to the right stream.
 *
 * The SDK writes every level through its own logger, and PM2 splits a service's
 * streams by fd: stdout -> out.log, stderr -> error.log. Node's console.warn
 * writes to stderr, so SDK warnings landed in error.log, e.g.:
 *
 *     [warn]: [ 'no im.message.reaction.deleted_v1 handle' ]
 *
 * That line means "an event arrived that this channel does not subscribe to" —
 * normal, harmless, and emitted every time someone reacts to a message. But a
 * customer opening error.log sees a wall of red and concludes the channel is
 * broken. That is a FALSE RED: the same class of defect as a false green, just
 * pointing the other way.
 *
 * The fix is not to silence warnings (that hides real ones too) and not to drop
 * the logger level (that hides every warning the SDK may ever raise). It is to
 * record warnings as warnings: only genuine errors belong on stderr.
 *
 * Note this logger is reached through lib/lark-sdk.js, which is what actually
 * attaches it to every SDK object. Wiring it into one object and not the rest
 * is how round 1 of this fix shipped broken.
 *
 * @param {object} [console_] - Console-like sink, injectable for tests.
 * @returns {{error: Function, warn: Function, info: Function, debug: Function, trace: Function}}
 *   A Logger matching the SDK's interface.
 */
export function createSdkLogger(console_ = console) {
  const toStdout = (...args) => console_.log('[feishu][sdk]', ...args);
  return {
    // Real errors keep stderr — these SHOULD reach error.log.
    error: (...args) => console_.error('[feishu][sdk]', ...args),
    // Everything below is informational; stderr would misrepresent it.
    warn: toStdout,
    info: toStdout,
    debug: toStdout,
    trace: toStdout,
  };
}
