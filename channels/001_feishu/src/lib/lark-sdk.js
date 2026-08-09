/**
 * The only place this channel constructs Feishu SDK objects.
 *
 * Why a factory instead of three `new Lark.*` calls at the call sites:
 * the SDK gives EVERY object its own logger, defaulting to one that writes
 * warnings to stderr. PM2 splits a service's output by fd, so a default-logger
 * object silently pipes its warnings into error.log.
 *
 * On 2026-08-09 the logger was wired into WSClient only. The line customers
 * actually saw —
 *
 *     [warn]: [ 'no im.message.reaction.created_v1 handle' ]
 *
 * — comes from EventDispatcher, which still had the default. Unit tests were
 * green because they tested the logger, not the wiring; a live install proved
 * the fix half-done. Routing every construction through here means an object
 * cannot be created without the logger — there is no call site left to forget.
 *
 * The mechanical floor that keeps it that way lives in test/lark-sdk.test.js:
 * raw `new Lark.*` in src/ fails the build.
 */

import * as Lark from '@larksuiteoapi/node-sdk';

import { createSdkLogger } from './sdk-logger.js';

/**
 * Logging options every SDK object must be built with.
 * @returns {{loggerLevel: unknown, logger: object}}
 */
export function sdkLoggerOptions() {
  return {
    loggerLevel: Lark.LoggerLevel.info,
    logger: createSdkLogger(),
  };
}

/**
 * WebSocket transport client.
 * @param {object} options - SDK options (appId, appSecret, domain, ...).
 * @returns {object} A Lark WSClient.
 */
export function createWsClient(options) {
  return new Lark.WSClient({ ...sdkLoggerOptions(), ...options });
}

/**
 * Event dispatcher. This is the object that emits "no <event> handle" for
 * every event type the app receives but never registered — the false red.
 * @param {object} [options] - SDK options (encryptKey, verificationToken, ...).
 * @returns {object} A Lark EventDispatcher.
 */
export function createEventDispatcher(options = {}) {
  return new Lark.EventDispatcher({ ...sdkLoggerOptions(), ...options });
}

/**
 * Outbound API client.
 * @param {object} options - SDK options (appId, appSecret, appType, domain).
 * @returns {object} A Lark Client.
 */
export function createApiClient(options) {
  return new Lark.Client({ ...sdkLoggerOptions(), ...options });
}
