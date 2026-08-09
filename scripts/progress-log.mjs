import fs from 'node:fs';
import path from 'node:path';

/**
 * The development progress log (docs/progress.md) is the one place a person can
 * read in five minutes to learn where these components actually got to. It only
 * stays that way if every release lands a row in it.
 *
 * "Everyone should keep maintaining it" is a good sentence, and a good sentence
 * in a document never failed a build. So the rule is mechanical instead.
 *
 * This repository ships several components out of one tree, each versioned on
 * its own, so the check is per component: every component under channels/ must
 * have rows of its own, and its newest row must name the version in its
 * package.json. A component added without a row is the failure this is really
 * for — that is how a second channel quietly stops being tracked.
 */

export const PROGRESS_LOG_PATH = path.join('docs', 'progress.md');
export const COMPONENT_ROOT = 'channels';

const START_MARKER = '<!-- progress-log:start -->';
const END_MARKER = '<!-- progress-log:end -->';

// | `feishu` | `0.1.3` | 2026-08-09 | `f378791` | one sentence |
const ROW = /^\|\s*`([^`|]+)`\s*\|\s*`([^`|]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`|]+)`\s*\|\s*(.+?)\s*\|$/;
const SEPARATOR_ROW = /^\|[\s:|-]+\|$/;
const HEADER_ROW = /^\|\s*组件\s*\|/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMPONENT = /^[a-z0-9][a-z0-9-]*$/;

const PLACEHOLDER = /^(tbd|todo|n\/a|-{1,}|待填|待补|同上)$/i;
const MINIMUM_SUMMARY_LENGTH = 8;

function splitVersion(version) {
  const [core, prerelease = ''] = version.split(/-(.+)/);
  return {
    numbers: core.split('.').map(Number),
    prerelease: prerelease ? prerelease.split('.') : [],
  };
}

/**
 * Semver precedence, enough of it for our own version lines: a version WITH a
 * prerelease sorts below the same version without one (0.1.0-alpha.4 < 0.1.0).
 */
export function compareVersions(a, b) {
  const left = splitVersion(a);
  const right = splitVersion(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left.numbers[i] ?? 0) - (right.numbers[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i += 1) {
    const x = left.prerelease[i];
    const y = right.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) - Number(y);
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * A component directory name (`001_feishu`) reduces to the name used everywhere
 * a customer sees it (`feishu`) — the same name `yos add feishu` takes.
 */
export function componentNameFromDirectory(directory) {
  return directory.replace(/^\d+[_-]/, '');
}

/**
 * @param {string} source - full contents of docs/progress.md
 * @returns {{component: string, version: string, date: string, commit: string, summary: string}[]}
 */
export function parseProgressLog(source) {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1) {
    throw new Error(
      `${PROGRESS_LOG_PATH}: could not find the node table between ${START_MARKER} and ${END_MARKER}`
    );
  }
  if (end < start) {
    throw new Error(`${PROGRESS_LOG_PATH}: node table markers are in the wrong order`);
  }

  const rows = [];
  const seen = new Set();

  for (const rawLine of source.slice(start + START_MARKER.length, end).split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    if (SEPARATOR_ROW.test(line) || HEADER_ROW.test(line)) continue;
    const match = ROW.exec(line);
    if (!match) {
      throw new Error(
        `${PROGRESS_LOG_PATH}: malformed node table row: ${line}\n`
        + 'expected: | `<component>` | `<version>` | <YYYY-MM-DD> | `<commit>` | <one sentence> |'
      );
    }
    const [, component, version, date, commit, summary] = match;
    if (!COMPONENT.test(component)) {
      throw new Error(`${PROGRESS_LOG_PATH}: "${component}" is not a component name`);
    }
    if (!VERSION.test(version)) {
      throw new Error(`${PROGRESS_LOG_PATH}: ${component}: "${version}" is not a version number`);
    }
    if (!DATE.test(date)) {
      throw new Error(`${PROGRESS_LOG_PATH}: ${component} ${version}: "${date}" is not a YYYY-MM-DD date`);
    }
    if (!COMMIT.test(commit)) {
      throw new Error(`${PROGRESS_LOG_PATH}: ${component} ${version}: "${commit}" is not a commit id`);
    }
    if (PLACEHOLDER.test(summary) || summary.length < MINIMUM_SUMMARY_LENGTH) {
      throw new Error(
        `${PROGRESS_LOG_PATH}: ${component} ${version}: say what this release solved; `
        + `"${summary}" is a placeholder, and a placeholder row is the same as no row`
      );
    }
    const key = `${component}@${version}`;
    if (seen.has(key)) {
      throw new Error(`${PROGRESS_LOG_PATH}: ${component} ${version} appears twice in the node table`);
    }
    seen.add(key);
    rows.push({ component, version, date, commit, summary });
  }

  if (rows.length === 0) {
    throw new Error(`${PROGRESS_LOG_PATH}: the node table has no entries`);
  }

  const byComponent = new Map();
  for (const row of rows) {
    if (!byComponent.has(row.component)) byComponent.set(row.component, []);
    byComponent.get(row.component).push(row);
  }
  for (const [component, componentRows] of byComponent) {
    for (let i = 1; i < componentRows.length; i += 1) {
      if (compareVersions(componentRows[i - 1].version, componentRows[i].version) <= 0) {
        throw new Error(
          `${PROGRESS_LOG_PATH}: ${component} rows must run newest to oldest, `
          + `but ${componentRows[i - 1].version} is listed above ${componentRows[i].version}`
        );
      }
    }
  }

  return rows;
}

/**
 * Every component that ships out of this tree, and the version it currently is.
 *
 * @returns {{name: string, directory: string, version: string}[]}
 */
export function discoverComponents(root) {
  const base = path.join(root, COMPONENT_ROOT);
  if (!fs.existsSync(base)) {
    throw new Error(`missing ${COMPONENT_ROOT}/: this repository ships components out of that directory`);
  }
  const components = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(base, entry.name, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      throw new Error(`could not read ${COMPONENT_ROOT}/${entry.name}/package.json: ${error.message}`);
    }
    if (typeof manifest.version !== 'string' || !VERSION.test(manifest.version)) {
      throw new Error(`${COMPONENT_ROOT}/${entry.name}: version "${manifest.version}" is not a version number`);
    }
    components.push({
      name: componentNameFromDirectory(entry.name),
      directory: entry.name,
      version: manifest.version,
    });
  }
  if (components.length === 0) {
    throw new Error(`no components found under ${COMPONENT_ROOT}/`);
  }
  return components;
}

/**
 * The gate itself: each component's released version must be its newest row.
 *
 * @returns {{entries: number, components: {name: string, version: string}[]}}
 */
export function verifyProgressLog(root) {
  const logPath = path.join(root, PROGRESS_LOG_PATH);
  if (!fs.existsSync(logPath)) {
    throw new Error(`missing ${PROGRESS_LOG_PATH}: the development progress log is not optional`);
  }
  const rows = parseProgressLog(fs.readFileSync(logPath, 'utf8'));
  const components = discoverComponents(root);

  for (const component of components) {
    const newest = rows.find((row) => row.component === component.name);
    if (!newest) {
      throw new Error(
        `${PROGRESS_LOG_PATH} has no rows for ${component.name} (${COMPONENT_ROOT}/${component.directory}). `
        + 'A component that ships without a line in the progress log is a component nobody is tracking.'
      );
    }
    if (newest.version !== component.version) {
      throw new Error(
        `${PROGRESS_LOG_PATH} is behind the release: ${component.name} is ${component.version}, `
        + `but its newest row in the node table is ${newest.version}. `
        + 'Add a row for this version — one line saying what it solved — before shipping.'
      );
    }
  }

  const known = new Set(components.map((component) => component.name));
  for (const row of rows) {
    if (!known.has(row.component)) {
      throw new Error(
        `${PROGRESS_LOG_PATH}: "${row.component}" has rows but no ${COMPONENT_ROOT}/ directory. `
        + 'Either the component was removed and its rows should move to a history section, or the name is a typo.'
      );
    }
  }

  return { entries: rows.length, components: components.map(({ name, version }) => ({ name, version })) };
}
