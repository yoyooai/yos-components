import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS_DIR = path.join(ROOT, 'channels');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

function componentDirs() {
  return fs
    .readdirSync(COMPONENTS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

function read(component, relativePath) {
  const file = path.join(COMPONENTS_DIR, component, relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function splitSkill(component) {
  const skill = read(component, 'SKILL.md') ?? '';
  const parts = skill.split(/^---$/m);
  return { frontmatter: parts[1] ?? '', body: parts.slice(2).join('---') };
}

/**
 * YOS links commands from SKILL.md's `bin` field into ~/yos/bin on install. It
 * does not read package.json's `bin` — components install as skill directories,
 * so npm never links that one.
 */
function declaredCommands(component) {
  const { frontmatter } = splitSkill(component);
  const binBlock = frontmatter.match(/^bin:\n((?:[ \t]+\S.*\n?)+)/m);
  if (!binBlock) return {};
  return Object.fromEntries(
    [...binBlock[1].matchAll(/^\s+([\w-]+):\s*(\S+)\s*$/gm)].map(m => [m[1], m[2]]),
  );
}

/**
 * Commands the component tells a user to type. Deliberately narrow: the same
 * `yos-<name>` token is also the pm2 service name and appears throughout the
 * lifecycle block and pm2 examples, and none of those are commands. Only three
 * shapes count as a promise — "Run yos-x sub", `yos-x sub` in backticks, and a
 * shell-block line beginning with it.
 */
function promisedCommands(component) {
  const { frontmatter, body } = splitSkill(component);
  const nextSteps = frontmatter.match(/^next-steps:\s*(.*(?:\n[ \t]+.*)*)/m)?.[1] ?? '';
  const sources = [
    nextSteps,
    body,
    read(component, 'hooks/post-install.js') ?? '',
    read(component, 'README.md') ?? '',
  ].join('\n');

  const withoutPm2 = sources.replace(/\bpm2\b[^\n`]*/g, '');
  const patterns = [
    /(?:^|\s)[Rr]un\s+`?(yos-[\w-]+)\s+[a-z]/g,
    /`(yos-[\w-]+)\s+[a-z][^`]*`/g,
    /^[ \t]*(yos-[\w-]+)\s+[a-z]/gm,
  ];

  const found = new Set();
  for (const pattern of patterns) {
    for (const match of withoutPm2.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

/** Files the package contract requires for this component. */
function requiredFiles(component) {
  const contract = fs
    .readdirSync(SCRIPTS_DIR)
    .filter(name => /^verify(-[a-z0-9]+)?-package\.mjs$/.test(name))
    .find(name => fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8').includes(component));
  assert.ok(contract, `no package contract covers ${component}`);

  const source = fs.readFileSync(path.join(SCRIPTS_DIR, contract), 'utf8');
  const block = source.match(/const REQUIRED_FILES = \[([\s\S]*?)\];/);
  assert.ok(block, `${contract} has no REQUIRED_FILES list`);
  return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('a component only promises commands it actually installs', () => {
  it('has components to check', () => {
    assert.ok(componentDirs().length >= 2, 'expected at least two components');
  });

  it('the promise detector still recognises the shapes we use', () => {
    // If a rewrite made this detector match nothing, the assertions below would
    // pass by finding no promises at all.
    const promises = componentDirs().flatMap(promisedCommands);
    assert.ok(promises.length >= 1, 'detector found no promised commands anywhere');
  });

  for (const component of componentDirs()) {
    it(`${component}: every promised command is declared in SKILL.md bin`, () => {
      const declared = declaredCommands(component);
      for (const command of promisedCommands(component)) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(declared, command),
          `${component} tells the user to run "${command}" but never declares it under bin: in SKILL.md — `
            + 'on a real install that is "command not found", with no way forward',
        );
      }
    });

    it(`${component}: every declared command ships and is required by the contract`, () => {
      const declared = declaredCommands(component);
      const required = requiredFiles(component);
      for (const [command, target] of Object.entries(declared)) {
        assert.ok(
          fs.existsSync(path.join(COMPONENTS_DIR, component, target)),
          `${component}: bin ${command} points at missing ${target}`,
        );
        assert.ok(
          required.includes(target),
          `${component}: bin ${command} points at ${target}, which the package contract does not require — `
            + 'nothing would notice if it stopped shipping',
        );
      }
    });
  }
});
