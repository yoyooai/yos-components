import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PROGRESS_LOG_PATH,
  compareVersions,
  componentNameFromDirectory,
  discoverComponents,
  parseProgressLog,
  verifyProgressLog,
} from '../scripts/progress-log.mjs';
import { runVerification } from '../scripts/verify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROW_FEISHU = '| `feishu` | `0.1.3` | 2026-08-09 | `f378791` | 说了不问的安装就真的不问 |';
const ROW_FEISHU_OLD = '| `feishu` | `0.1.2` | 2026-08-09 | `b7e3f18` | SDK 告警不再落进 error.log |';
const ROW_WEIXIN = '| `weixin` | `0.1.2` | 2026-08-06 | `192412d` | 如实声明这个渠道跑在哪个 Node 上 |';

function log(rows, { start = true, end = true } = {}) {
  return [
    '# 开发进度',
    '',
    start ? '<!-- progress-log:start -->' : '',
    '| 组件 | 版本 | 日期 | 提交 | 这一版解决了什么 |',
    '|---|---|---|---|---|',
    ...rows,
    end ? '<!-- progress-log:end -->' : '',
    '',
  ].join('\n');
}

/** A throwaway tree shaped like this repository: channels/<dir>/package.json. */
function fixture(logSource, components = { '001_feishu': '0.1.3', '002_weixin': '0.1.2' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-progress-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  if (logSource !== null) fs.writeFileSync(path.join(root, PROGRESS_LOG_PATH), logSource);
  for (const [directory, version] of Object.entries(components)) {
    const dir = path.join(root, 'channels', directory);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: directory, version }));
  }
  return root;
}

function throws(root, pattern) {
  assert.throws(() => verifyProgressLog(root), pattern);
}

// ── Why this gate exists ──
//
// "Whoever develops next should keep the progress log up to date" is a rule that
// lives or dies on people remembering it. Every rule we left in a document
// decayed; the ones that survived are the ones that fail a build.

test('the repository’s own progress log is current with every component', () => {
  const result = verifyProgressLog(ROOT);
  assert.ok(result.entries > 0);
  for (const component of result.components) {
    const directory = fs.readdirSync(path.join(ROOT, 'channels'))
      .find((entry) => componentNameFromDirectory(entry) === component.name);
    assert.ok(directory, `no directory for ${component.name}`);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'channels', directory, 'package.json'), 'utf8')
    );
    assert.equal(component.version, manifest.version);
  }
});

test('rejects a component release the progress log never mentions', () => {
  throws(fixture(log([ROW_FEISHU_OLD, ROW_WEIXIN])), /behind the release: feishu is 0\.1\.3/);
});

test('rejects a component that ships with no rows at all', () => {
  // The real failure this is for: a second channel lands and nobody tracks it.
  throws(fixture(log([ROW_FEISHU, ROW_FEISHU_OLD])), /no rows for weixin/);
});

test('rejects rows for a component that does not exist', () => {
  throws(
    fixture(log([ROW_FEISHU, ROW_WEIXIN, '| `dingtalk` | `0.1.0` | 2026-08-06 | `abc1234` | 一个并不存在的组件 |'])),
    /has rows but no channels\/ directory/
  );
});

test('rejects a missing progress log outright', () => {
  throws(fixture(null), /missing docs[/\\]progress\.md/);
});

test('rejects a log with the node table markers removed', () => {
  throws(fixture(log([ROW_FEISHU, ROW_WEIXIN], { start: false })), /could not find the node table/);
});

test('rejects an empty node table', () => {
  throws(fixture(log([])), /no entries/);
});

test('rejects a placeholder summary, because an empty row is the same as no row', () => {
  for (const summary of ['TBD', '待填', '-', 'todo']) {
    throws(fixture(log([`| \`feishu\` | \`0.1.3\` | 2026-08-09 | \`f378791\` | ${summary} |`, ROW_WEIXIN])), /placeholder/);
  }
});

test('rejects a malformed row instead of silently skipping it', () => {
  throws(fixture(log(['| feishu | 0.1.3 | 2026-08-09 | f378791 | 没有反引号 |'])), /malformed node table row/);
});

test('rejects an unusable date or commit id', () => {
  throws(fixture(log([`| \`feishu\` | \`0.1.3\` | 昨天 | \`f378791\` | 日期不是日期 |`, ROW_WEIXIN])), /not a YYYY-MM-DD date/);
  throws(fixture(log([`| \`feishu\` | \`0.1.3\` | 2026-08-09 | \`zzzzzzz\` | 提交号不是提交号 |`, ROW_WEIXIN])), /not a commit id/);
});

test('rejects the same component version listed twice', () => {
  throws(fixture(log([ROW_FEISHU, ROW_FEISHU, ROW_WEIXIN])), /appears twice/);
});

test('rejects a component whose rows run oldest to newest', () => {
  throws(fixture(log([ROW_FEISHU_OLD, ROW_FEISHU, ROW_WEIXIN])), /must run newest to oldest/);
});

test('each component is ordered on its own, not against the others', () => {
  // weixin 0.1.2 sitting below feishu 0.1.3 is not an ordering error.
  const rows = parseProgressLog(log([ROW_FEISHU, ROW_FEISHU_OLD, ROW_WEIXIN]));
  assert.deepEqual(rows.map((row) => `${row.component}@${row.version}`),
    ['feishu@0.1.3', 'feishu@0.1.2', 'weixin@0.1.2']);
});

test('orders prereleases below the release they lead to', () => {
  assert.ok(compareVersions('0.1.0', '0.1.0-alpha.4') > 0);
  assert.ok(compareVersions('0.1.0-alpha.4', '0.1.0-alpha.3') > 0);
  assert.ok(compareVersions('0.1.3', '0.1.1') > 0);
  assert.equal(compareVersions('0.1.2', '0.1.2'), 0);
});

test('a component directory reduces to the name customers type', () => {
  assert.equal(componentNameFromDirectory('001_feishu'), 'feishu');
  assert.equal(componentNameFromDirectory('002_weixin'), 'weixin');
  assert.equal(componentNameFromDirectory('tools'), 'tools');
});

test('discovers every component that ships out of this tree', () => {
  const components = discoverComponents(ROOT).map(({ name }) => name);
  assert.ok(components.includes('feishu'));
  assert.ok(components.includes('weixin'));
});

// ── The gate has to actually run ──

test('verification runs the progress-log gate and fails closed when it throws', () => {
  const calls = [];
  const common = {
    verifyTestPolicyImpl: () => calls.push('policy'),
    verifyRecordedTestCountsImpl: (counts) => {
      calls.push('counts');
      return counts;
    },
    testSuites: [],
    testBaselines: {},
    steps: [],
  };

  assert.equal(runVerification({
    ...common,
    verifyProgressLogImpl: () => calls.push('progress'),
  }), true);
  assert.deepEqual(calls, ['policy', 'progress', 'counts']);

  calls.length = 0;
  assert.equal(runVerification({
    ...common,
    verifyProgressLogImpl: () => {
      calls.push('progress');
      throw new Error('progress log is behind the release');
    },
    steps: [['must not run', process.execPath, ['-e', 'process.exit(0)']]],
  }), false);
  assert.deepEqual(calls, ['policy', 'progress']);
});

test('the gate is wired into verification by name, not just injectable', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'verify.mjs'), 'utf8');
  assert.match(source, /import \{ verifyProgressLog \} from '\.\/progress-log\.mjs';/);
  assert.match(source, /verifyProgressLogImpl = verifyProgressLog,/);
  assert.match(source, /^\s*verifyProgressLogImpl\(root\);$/m);
});
