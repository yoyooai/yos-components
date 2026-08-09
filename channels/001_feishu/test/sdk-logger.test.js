import test from 'node:test';
import assert from 'node:assert/strict';

import { createSdkLogger } from '../src/lib/sdk-logger.js';

// Regression (TD-129, observed on a live install 2026-08-09): PM2 splits a
// service's output by fd — stdout to out.log, stderr to error.log. Node's
// console.warn writes to STDERR, so every SDK warning landed in error.log:
//
//     [warn]: [ 'no im.message.reaction.deleted_v1 handle' ]
//
// That line just means an event arrived that this channel never subscribed to
// (someone reacted to a message). Nothing is broken — but a customer opening
// error.log sees a wall of red and concludes the channel is down. A false red
// is the same defect as a false green, pointing the other way.

function makeSink() {
  const out = [];
  const err = [];
  return {
    out,
    err,
    console: {
      log: (...a) => out.push(a.join(' ')),
      error: (...a) => err.push(a.join(' ')),
    },
  };
}

test('warn goes to stdout, never stderr — this is the whole point of the fix', () => {
  const sink = makeSink();
  createSdkLogger(sink.console).warn('no im.message.reaction.deleted_v1 handle');
  assert.equal(sink.err.length, 0, 'a warning must NOT reach stderr/error.log');
  assert.equal(sink.out.length, 1);
  assert.match(sink.out[0], /reaction\.deleted_v1/);
});

test('info, debug and trace also stay on stdout', () => {
  const sink = makeSink();
  const log = createSdkLogger(sink.console);
  log.info('ws client ready');
  log.debug('handshake');
  log.trace('frame');
  assert.equal(sink.err.length, 0);
  assert.equal(sink.out.length, 3);
});

test('genuine errors DO still reach stderr — the fix must not blind error.log', () => {
  const sink = makeSink();
  createSdkLogger(sink.console).error('connection refused');
  assert.equal(sink.err.length, 1, 'errors must remain visible in error.log');
  assert.match(sink.err[0], /connection refused/);
  assert.equal(sink.out.length, 0);
});

test('nothing is swallowed: every level still emits exactly one line', () => {
  // Silencing warnings would also "fix" error.log — and hide real problems.
  // Guard against that shortcut being taken later.
  for (const level of ['error', 'warn', 'info', 'debug', 'trace']) {
    const sink = makeSink();
    createSdkLogger(sink.console)[level]('payload');
    assert.equal(
      sink.out.length + sink.err.length,
      1,
      `level ${level} must emit exactly one line (not be dropped)`
    );
  }
});

test('lines are tagged so their origin is identifiable in a mixed log', () => {
  const sink = makeSink();
  createSdkLogger(sink.console).warn('something');
  assert.match(sink.out[0], /\[feishu\]\[sdk\]/);
});
