// TD-117 — 入口点打火测试（飞书渠道）
//
// 为什么存在：微信渠道 0.1.0 曾经「装上即死」—— 入口点 import 了一个不存在的
// 命名导出，服务与管理 CLI 双双在**模块解析阶段**崩溃，组件从头到尾不可用。
// 而当时 30/30 根测试、10 套件、`npm run verify`、包指纹逐字一致 —— 全部为绿。
// 原因：那些测试只 import 具体 lib 模块，**从未启动过任何一个入口点**；
// `node --check` 只解析单文件、不解析 import 目标的导出。
//
// 这个测试是当时定下的正解（TD-36），但它随老仓一起留在了 Codeup，
// 换权威仓时修复搬了、护栏没搬（TD-117）。这里把它补回来。
//
// 原理：ESM 的**静态 import 图在任何代码执行之前解析完毕**。
// 所以只要入口点吐出了它自己的任何一句话，就证明整张静态图是通的。
// 断言因此一律用「正面证据」（必须看见某句话），而不是「没看见报错就算过」——
// 后者在命令根本没跑起来时也会绿。
//
// 两个坑，是这个测试自己踩过的，别改回去：
//  ① 不要用「起子进程 + 同步忙等」判早退：忙等堵死本进程事件循环，
//     子进程退出事件读不到 ⇒ 坏代码也判绿。要用 spawnSync + 固定启动窗口。
//  ② 不要写死端口：在已跑本组件的机器上会 EADDRINUSE 假红。
//     （本测试不绑端口，靠 HOME 沙箱隔离，天然避开。）

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOT_WINDOW_MS = 15_000;

// 模块解析/加载阶段失败的签名。看见任何一条 = 入口点没起来。
const LOAD_FAILURE = [
  /ERR_MODULE_NOT_FOUND/,
  /Cannot find module/,
  /Cannot find package/,
  /does not provide an export named/,
  /SyntaxError/,
  /ERR_UNSUPPORTED_DIR_IMPORT/,
  /ERR_REQUIRE_ESM/,
];

// 每个入口点：怎么点火 + 点着了会说的那句话（正面证据）。
const PROBES = [
  {
    entry: 'src/index.js',
    args: [],
    // 缺凭据时它会自己退出 1 —— 那是它**自己的逻辑**在跑，正是我们要的证据。
    expect: /\[feishu\] Starting/,
    why: '服务主入口（PM2 跑的就是它）',
  },
  {
    entry: 'src/admin.js',
    args: [],
    expect: /yos-feishu admin CLI/,
    why: '管理 CLI —— 登录/白名单/分组全靠它，0.1.0 就是它和主入口一起死的',
  },
  {
    entry: 'src/cli.js',
    args: [],
    expect: /Feishu CLI/,
    why: '面向用户的 CLI',
  },
];

function boot(entry, args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-boot-'));
  try {
    const result = spawnSync(process.execPath, [path.join(ROOT, entry), ...args], {
      cwd: ROOT,
      env: { ...process.env, HOME: home, NO_COLOR: '1' },
      encoding: 'utf8',
      timeout: BOOT_WINDOW_MS,
    });
    // 入口点若是常驻的，不会自己退出，会被启动窗口 SIGTERM 打死 —— spawnSync
    // 把这记成 error.code = 'ETIMEDOUT'。**那是「它还活着」，不是「它没起来」。**
    // 只有别的 spawn 错误（Node 根本没跑起来）才算真失败。
    const timedOut = result.error?.code === 'ETIMEDOUT';
    return {
      spawnError: timedOut ? undefined : result.error,
      timedOut,
      output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

for (const probe of PROBES) {
  test(`entry point boots: ${probe.entry} — ${probe.why}`, () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, probe.entry)),
      `入口点文件不存在：${probe.entry}。改了入口点就要同步改这张表，不许静悄悄跳过。`,
    );

    const result = boot(probe.entry, probe.args);

    // spawn 本身失败（Node 没起来）必须红，不能当成「没输出」放过。
    assert.equal(result.spawnError, undefined, `启动 ${probe.entry} 失败：${result.spawnError?.message}`);

    for (const signature of LOAD_FAILURE) {
      assert.doesNotMatch(
        result.output,
        signature,
        `${probe.entry} 在模块加载阶段就崩了（命中 ${signature}）。`
          + `这正是 0.1.0 装上即死的病。\n---- 实际输出 ----\n${result.output}`,
      );
    }

    // 正面证据：必须看见它自己说的话。空输出一律算红。
    assert.match(
      result.output,
      probe.expect,
      `${probe.entry} 没有吐出它自己的启动证据（期望匹配 ${probe.expect}）。`
        + `没有正面证据就不算起来了 —— 命令早死也会「没有报错」。`
        + `\n---- 实际输出 ----\n${result.output || '(空)'}`,
    );
  });
}

// 这一条让护栏自己会长：package.json 里声明的入口点，必须都有人点火。
// 有人改了 main / bin / start 指向新文件却不加打火，这里报红。
test('every entry point declared in package.json is covered by a boot probe', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const declared = new Set();

  const consider = (value) => {
    if (typeof value !== 'string') return;
    for (const token of value.split(/\s+/)) {
      if (!/\.(js|mjs|cjs|ts)$/.test(token)) continue;
      if (token.startsWith('-')) continue;
      const resolved = path.resolve(ROOT, token);
      // 只认落在本组件内、且不在 test/ 下的真实文件。
      if (!resolved.startsWith(ROOT + path.sep)) continue;
      const relative = path.relative(ROOT, resolved);
      if (relative.split(path.sep)[0] === 'test') continue;
      if (!fs.existsSync(resolved)) continue;
      declared.add(relative);
    }
  };

  consider(manifest.main);
  for (const value of Object.values(manifest.bin ?? {})) consider(value);
  for (const value of Object.values(manifest.scripts ?? {})) consider(value);

  assert.ok(declared.size > 0, 'package.json 里一个入口点都没解析出来 —— 解析逻辑坏了，不是「没有入口点」。');

  const covered = new Set(PROBES.map((probe) => probe.entry));
  const uncovered = [...declared].filter((entry) => !covered.has(entry));
  assert.deepEqual(
    uncovered,
    [],
    `这些入口点在 package.json 里声明了，但没有打火测试：${uncovered.join(', ')}。`
      + `给 PROBES 加一条 —— 入口点没人点火，就是 0.1.0 那个洞又开了。`,
  );
});
