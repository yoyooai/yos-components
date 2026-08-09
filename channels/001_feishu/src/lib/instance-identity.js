/**
 * Who this running copy of the channel is.
 *
 * Why it exists: Feishu delivers each event to exactly one long connection.
 * Install the same App ID on two machines and both connect happily — events
 * are then split between them at random, so one bot contradicts itself while
 * *both* logs look completely normal read on their own. That happened on
 * 2026-08-09 and cost hours, because nothing anywhere said which machine had
 * answered.
 *
 * The platform does not tell a client how many connections an app has (the
 * SDK's handshake returns ping/reconnect settings and this connection's own
 * device id, nothing about the others), so the channel cannot detect the
 * clash by itself. What it can do is stamp every line it writes, so the
 * question "was this me?" takes one look at a log instead of a day.
 *
 * The App ID is truncated deliberately: enough to tell two apps apart, not
 * enough to be a copy of a credential in a log file.
 */

import os from 'node:os';

/**
 * @param {object} [opts]
 * @param {string} [opts.appId]
 * @param {string} [opts.hostname]
 * @param {number} [opts.pid]
 * @returns {{host: string, pid: number, app: string, short: string, line: string}}
 */
export function describeInstance({ appId = '', hostname = os.hostname(), pid = process.pid } = {}) {
  const app = appId ? `…${String(appId).slice(-6)}` : '(unknown)';
  const short = `${hostname}/${pid}`;
  return {
    host: hostname,
    pid,
    app,
    short,
    line: `host=${hostname} pid=${pid} app=${app}`,
  };
}

/**
 * The warning that turns a silent split-brain into a one-look diagnosis.
 * Printed once at startup, next to the identity line it refers to.
 *
 * @returns {string[]} lines to log, in order
 */
export function duplicateConnectionNotice(instance) {
  return [
    `[feishu] This instance: ${instance.line}`,
    '[feishu] Feishu gives each event to only ONE connection for an App ID.',
    '[feishu] If this App ID also runs elsewhere, replies get split between the',
    '[feishu] machines at random and each log looks normal on its own — compare',
    '[feishu] the identity above, and the host= tag on each handled message.',
  ];
}
