# 飞书渠道开发侧自测记录

## Lock

- Development branch: `feat/feishu-channel-20260804`
- Implementation commit: `181896e`
- Upstream commit: `877690965798b99979f21211290d6f284be787b7`
- Upstream archive SHA-256:
  `a7ceff5a7633e9a9041bbefaa5426108ce520b1b6b2bb5ce43e9da9a0aeac398`
- YOS Core install baseline: `origin/main@fe908f2`

## Locked Environment

- Node.js: `24.18.0`
- npm: `11.16.0`
- Platform: macOS arm64 development machine

Linux remains part of independent acceptance; this record does not substitute
for that environment.

## Automated Gates

| Gate | Result |
|---|---:|
| Repository contracts | 4/4 passed |
| Feishu component tests | 29/29 passed |
| npm audit, official registry | 0 vulnerabilities |
| Package entries | 27 |
| Package unpacked bytes | 215,254 |
| Package content SHA-256 | `a23b395215882cca9f25d2e0ba717e90a34401aa9ac4e0fea810d1419536ef6f` |

## Package Reproduction

Two independent `npm pack --ignore-scripts` runs produced byte-identical
artifacts:

- Artifact bytes: 56,633
- Artifact SHA-256:
  `af54e4f6243f45613e720bbccd3f3838ec89867c88d6a4f148bcdb87d45f8860`
- Entries: 27

The package contains runtime source, lifecycle hooks, component contracts,
license and provenance only. It excludes tests, dependencies, environment
files and local build output.

## Negative Verification

The package gate was deliberately attacked twice:

1. An untracked file under `src/` was included by npm and rejected as
   `package contains an untracked file`.
2. A private `/Users/...` path was added to a tracked package file and rejected
   by the package hygiene check.

Both temporary mutations were removed before final verification.

## Guard Self-Protection Follow-up

The candidate now includes automated protection for the previously manual
checks:

- Root repository tests: `12/12` passed.
- Feishu component tests: `29/29` passed.
- Removing the runtime `chmod(DATA_DIR, 0o700)` made the permission test fail.
- Changing the runtime mode to `0755` made the permission test fail.
- Removing either the untracked-file check or private-path check made its
  package-policy test fail.
- Changing a component test to `skip` made the repository policy fail.
- `npm run verify` passed with 0 audit vulnerabilities and the unchanged
  27-entry package digest
  `a23b395215882cca9f25d2e0ba717e90a34401aa9ac4e0fea810d1419536ef6f`.

These are development-side results. XiaoA's independent mutation run remains
the acceptance gate.

### Executed-count guard follow-up

The repository gate now parses TAP summaries instead of trusting exit code 0:

- Repository approved minimum: 21; final development run: `21/21`.
- Feishu approved minimum: 29; final development run: `29/29`.
- Any failed, cancelled, skipped or todo test rejects the candidate.
- Baseline changes require a matching approval digest, and the gate wiring is
  protected against removal or conditional disabling.
- A no-op test runner is rejected before audits and packaging. Wrapping test
  execution in warning-only `try/catch` is also rejected by the wiring guard.
- The runtime permission test starts from an existing `0755` directory and
  confirms that startup tightens it to `0700`.

Deliberately narrowing the test glob, deleting a protected test, disabling the
gate and removing the permission tightening all made verification fail. The
final package remains 27 entries with content digest
`6f0fcc4390e3c131169902a682f60ef935a06b26d46015cb5eb48556fc294444`.
Its final unpacked size is 215,274 bytes.

### Outer-wrapper hardening

- Repository approved minimum: 22; final development run: 22/22.
- Feishu approved minimum remains 29/29.
- Test execution and count validation return an explicit confirmation that must
  be consumed before audit or packaging steps.
- A throwing test gate is caught as a verification failure. The confirmation
  state and final decision live outside the verification try/catch, so a nested
  warning-only wrapper cannot make later successful steps produce PASS.
- Static policy rejects removal of the final validator line or gate call, and
  rejects moving the confirmation declaration or final decision back inside
  the verification try/catch.
- Final npm run verify: PASS; audit 0 vulnerabilities; Feishu package remains
  27 entries with content digest
  6f0fcc4390e3c131169902a682f60ef935a06b26d46015cb5eb48556fc294444.

These are development-side results and still require XiaoA's independent
mutation run.

## Isolated Lifecycle Verification

1. The real post-install hook ran in a temporary HOME with fake `yos` and
   `lark-cli` executables. It created a `0700` data directory and `0600`
   configuration without exposing the test secret.
2. The byte-identical package was installed through the real YOS Core
   `yos add --json` local-tarball path.
3. YOS recorded `feishu@0.1.0-alpha.1`, installed production dependencies and
   generated its managed file manifest.
4. `yos remove feishu --yes --purge --json` removed the skill directory, data
   directory and component registration.

All work used temporary directories and did not touch a running YOS or PM2.

## Not Yet Verified

- Real Feishu tenant authentication and bot permission setup.
- Real private chat, group mention, media, file and card round trips through C4.
- WebSocket reconnect and host reboot recovery.
- Public webhook route and encrypted callback behavior.
- Cold download and installation of `lark-cli` plus all 27 sub-skills.
- Linux x64 reproduction and independent package build.
- Registry publication, immutable channel tag and customer installation.

These items belong to XiaoA's independent acceptance. Until they pass, this
component is a development candidate rather than a released YOS channel.
