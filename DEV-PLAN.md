# YOS Feishu Channel Development Plan

## Technical Baseline

- Repository: `yoyooai/yos-components`
- Component: `channels/001_feishu`
- YOS component candidate: `0.1.4`
- Node contract: `>=20.20.0`
- Upstream: `zylos-ai/zylos-feishu@a683464aee51d0318a98cb28581fc911b37c66ee`
- Upstream release: `0.3.5`

## Work Items

1. Add repository contracts and provenance lock.
   Verification: tests fail while the component is absent, then pass only for
   the pinned source and approved component metadata.
2. Import upstream runtime and tests.
   Verification: imported behavior tests pass without functional deletion.
3. Adapt paths, names, lifecycle and C4 integration to YOS.
   Verification: contract tests find no old runtime brand or private paths.
4. Harden configuration and package boundaries.
   Verification: file modes, package dry-run, source lock and audit pass.
5. Run isolated install/start/purge validation.
   Verification: service starts, C4 contract is exercised and purge returns the
   isolated environment to its original state.
6. Prepare independent acceptance evidence.
   Verification: locked commit, exact test counts, package manifest and all
   untested real-platform scenarios are listed without overclaiming.

## Rejected Alternative

Reusing the old Channels repository was rejected because it would carry old
branding, historical assumptions and unreviewed local modifications into the
new YOS product line. The latest official upstream source is a clearer base and
keeps future upstream comparisons reproducible.
