import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as Lark from '@larksuiteoapi/node-sdk';

import { createEventDispatcher, createWsClient, createApiClient, sdkLoggerOptions } from '../src/lib/lark-sdk.js';

// Regression (TD-129 round 2, caught on a live install 2026-08-09).
//
// Round 1 gave WSClient a stdout logger and shipped. test/sdk-logger.test.js
// was green — it proved the logger itself works. But the line customers saw,
//
//     [warn]: [ 'no im.message.reaction.created_v1 handle' ]
//
// is emitted by EventDispatcher, which was still built with the SDK default
// and kept writing to stderr -> error.log. Reacting to a message on the live
// machine reproduced it 100%, twice, after the new build was running.
//
// The lesson these tests encode: testing the PART is not testing the WIRING.
// Below, the first group drives the REAL SDK objects (no mocks of the thing
// under test), and the second is a mechanical floor — a new `new Lark.*` call
// site anywhere in src/ fails the build, because "someone adds a fourth
// construction site and forgets the logger" is exactly what happened here.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');

/** Capture the process streams the SDK's console-based logger writes to. */
function captureStreams(fn) {
  const out = [];
  const err = [];
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  process.stdout.write = (chunk, ...rest) => { out.push(String(chunk)); return true; };
  process.stderr.write = (chunk, ...rest) => { err.push(String(chunk)); return true; };
  try {
    return { result: fn(), out, err };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

async function captureStreamsAsync(fn) {
  const out = [];
  const err = [];
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  process.stdout.write = (chunk) => { out.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { err.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { out, err };
}

/** A v2 event envelope for an event type nobody registered a handler for. */
function unhandledReactionEvent() {
  return {
    schema: '2.0',
    header: { event_type: 'im.message.reaction.created_v1' },
    event: {},
  };
}

// ------------------------------------------------------------------
// Behaviour: the real SDK objects, driven the way production drives them
// ------------------------------------------------------------------

test('THE BUG: a reaction to an unsubscribed event must not reach stderr/error.log', async () => {
  // Exactly what happened on the live machine: an event arrives, no handler is
  // registered, the dispatcher warns. That warn must land on stdout.
  const dispatcher = createEventDispatcher().register({
    'im.message.receive_v1': async () => 'handled',
  });

  const { out, err } = await captureStreamsAsync(async () => {
    await dispatcher.invoke(unhandledReactionEvent());
  });

  const stderrText = err.join('');
  const stdoutText = out.join('');

  assert.equal(
    /reaction\.created_v1/.test(stderrText),
    false,
    `the "no ... handle" warn must NOT reach stderr/error.log, got: ${stderrText}`
  );
  assert.match(
    stdoutText,
    /no im\.message\.reaction\.created_v1 handle/,
    'the warn must still be recorded — on stdout, not silenced'
  );
});

test('a dispatcher built the default way DOES leak to stderr — proves the test can fail', async () => {
  // Negative control. Without this, the assertion above would also pass if the
  // SDK stopped warning at all, and we would be testing nothing.
  const raw = new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async () => 'handled',
  });

  const { err } = await captureStreamsAsync(async () => {
    await raw.invoke(unhandledReactionEvent());
  });

  assert.match(
    err.join(''),
    /no im\.message\.reaction\.created_v1 handle/,
    'the SDK default is meant to be the broken behaviour this fix replaces'
  );
});

test('registered events still work — the logger swap must not break dispatch', async () => {
  const dispatcher = createEventDispatcher().register({
    'im.message.receive_v1': async () => 'handled',
  });

  const result = await dispatcher.invoke({
    schema: '2.0',
    header: { event_type: 'im.message.receive_v1' },
    event: {},
  });

  assert.equal(result, 'handled');
});

test('genuine SDK errors still reach stderr — the fix must not blind error.log', () => {
  const { err } = captureStreams(() => {
    sdkLoggerOptions().logger.error('connection refused');
  });
  assert.match(err.join(''), /connection refused/);
});

test('every factory hands the SDK object a logger', () => {
  const opts = sdkLoggerOptions();
  assert.ok(opts.logger, 'sdkLoggerOptions must carry a logger');
  for (const level of ['error', 'warn', 'info', 'debug', 'trace']) {
    assert.equal(typeof opts.logger[level], 'function', `logger.${level} must exist`);
  }

  // Construct each one for real; a signature change here should fail loudly.
  const creds = { appId: 'cli_test', appSecret: 'secret', domain: Lark.Domain.Feishu };
  assert.ok(createWsClient({ ...creds, autoReconnect: false }));
  assert.ok(createApiClient({ ...creds, appType: Lark.AppType.SelfBuild }));
  assert.ok(createEventDispatcher());
});

test('a caller cannot accidentally drop the logger by passing its own options', () => {
  // Spread order matters: caller options must not overwrite the logger unless
  // they deliberately name it. Guards against `{...options, ...defaults}` being
  // flipped later.
  const dispatcher = createEventDispatcher({ encryptKey: '' });
  assert.ok(dispatcher.logger, 'dispatcher must still have a logger');
});

// ------------------------------------------------------------------
// Mechanical floor: no construction site may bypass the factory
// ------------------------------------------------------------------

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('src/ constructs SDK objects only through lib/lark-sdk.js', () => {
  // This is the rule that would have caught the half-done fix: WSClient was
  // wired, EventDispatcher and two Clients were not.
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    if (path.basename(file) === 'lark-sdk.js') continue; // the one allowed site
    const text = fs.readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (/new\s+[A-Za-z_$][\w$]*\.(WSClient|EventDispatcher|Client)\s*\(/.test(line)) {
        offenders.push(`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'construct SDK objects via createWsClient/createEventDispatcher/createApiClient ' +
    'from lib/lark-sdk.js — a raw `new Lark.*` gets the SDK default logger, ' +
    'which writes warnings to stderr and fills error.log with false reds:\n' +
    offenders.join('\n')
  );
});

test('lib/lark-sdk.js is the only file importing the SDK for construction', () => {
  // Softer companion to the rule above: importing the SDK for enums
  // (Lark.Domain.Feishu) is fine, so this only records where that happens,
  // and fails if the allowed construction site itself disappears.
  const factory = path.join(SRC, 'lib', 'lark-sdk.js');
  assert.ok(fs.existsSync(factory), 'lib/lark-sdk.js must exist — it owns SDK construction');
  const text = fs.readFileSync(factory, 'utf8');
  for (const name of ['WSClient', 'EventDispatcher', 'Client']) {
    assert.match(text, new RegExp(`new Lark\\.${name}\\s*\\(`), `factory must construct ${name}`);
  }
});
