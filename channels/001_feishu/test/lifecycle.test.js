import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUB_SKILLS = [
  'lark-apps', 'lark-approval', 'lark-attendance', 'lark-base',
  'lark-calendar', 'lark-contact', 'lark-doc', 'lark-drive', 'lark-event',
  'lark-im', 'lark-mail', 'lark-markdown', 'lark-minutes', 'lark-note',
  'lark-okr', 'lark-openapi-explorer', 'lark-shared', 'lark-sheets',
  'lark-skill-maker', 'lark-slides', 'lark-task', 'lark-vc', 'lark-vc-agent',
  'lark-whiteboard', 'lark-wiki', 'lark-workflow-meeting-summary',
  'lark-workflow-standup-report',
];

function writeExecutable(file, body) {
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

test('non-interactive post-install creates a private, usable YOS data layout', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yos-feishu-install-'));
  const component = path.join(temporaryRoot, 'component');
  const home = path.join(temporaryRoot, 'home');
  const bin = path.join(temporaryRoot, 'bin');

  try {
    fs.mkdirSync(component, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(bin, { recursive: true });
    fs.cpSync(path.join(ROOT, 'hooks'), path.join(component, 'hooks'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(component, 'package.json'));
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(component, 'node_modules'));

    const references = path.join(component, 'references');
    for (const skill of SUB_SKILLS) {
      const skillDir = path.join(references, skill);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skill}\n`);
    }
    fs.writeFileSync(path.join(references, '.lark-cli-version'), '1.0.81\n');

    writeExecutable(path.join(bin, 'yos'), 'printf "0.1.0-alpha.1\\n"');
    writeExecutable(
      path.join(bin, 'lark-cli'),
      'if [ "$1" = "--version" ]; then printf "1.0.81\\n"; else cat >/dev/null; fi',
    );

    const yosDir = path.join(home, 'yos');
    fs.mkdirSync(yosDir, { recursive: true, mode: 0o700 });
    const appSecret = 'feishu-test-secret-value';
    fs.writeFileSync(
      path.join(yosDir, '.env'),
      `FEISHU_APP_ID=cli_test_app\nFEISHU_APP_SECRET=${appSecret}\n`,
      { mode: 0o600 },
    );

    const result = spawnSync(process.execPath, [path.join(component, 'hooks', 'post-install.js')], {
      cwd: component,
      env: {
        ...process.env,
        HOME: home,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
      encoding: 'utf8',
      timeout: 20_000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(appSecret));
    assert.match(result.stdout, /Connection mode set to: websocket|Setup — Remaining Steps/);

    const dataDir = path.join(yosDir, 'components', 'feishu');
    const configPath = path.join(dataDir, 'config.json');
    assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), {
      enabled: true,
      connection_mode: 'websocket',
      webhook_port: 3458,
      message: { useMarkdownCard: true },
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
