# YOS Feishu Channel Product Spec

## Goal

Create the first independently installable YOS channel by adapting the latest
audited upstream Feishu implementation into `channels/001_feishu/`.

The channel connects Feishu messages to YOS through the existing C4 contract.
It must remain independently versioned, packaged, installed, upgraded and
removed without adding Feishu-specific behavior to YOS Core.

## Audience

- YOS operators connecting a Feishu tenant.
- YOS maintainers reviewing and publishing channel components.
- Independent reviewers reproducing the import and verification evidence.

## Required Behavior

1. Support upstream WebSocket and webhook connection modes.
2. Preserve upstream direct messages, group messages, cards, media and files.
3. Deliver inbound messages through C4 with the original Feishu message ID.
4. Send replies and proactive messages through the existing C4 send contract.
5. Keep credentials and customer data outside the installed component source.
6. Use YOS paths, service names, commands and component lifecycle contracts.
7. Preserve upstream attribution and pin the exact imported source revision.
8. Produce an independent channel package with a deterministic file list.

## Security Requirements

- No committed Feishu credentials, private home paths or customer identifiers.
- Runtime and package metadata must not depend on old product brands.
- Configuration and internal token files must use restrictive permissions.
- Explicit source and package validation must fail closed.
- Failed lifecycle hooks must return a visible non-zero result.

## Not In Scope

- No YOS Core changes.
- No migration of the old Channels repository.
- No production Registry publication or public release.
- No claim of real Feishu tenant acceptance before XiaoA's independent test.
- No credentials committed for automated tests.

## Acceptance

- Repository and component contract tests pass.
- Upstream behavior tests pass after the adaptation.
- Package contents contain only approved runtime and documentation files.
- Dependency audit reports no known vulnerabilities.
- A clean isolated YOS installation can install, start and purge the package.
- XiaoA completes a real Feishu message, reply, media and restart workflow.
