# Feature: 飞书渠道

## Background

YOS Core is intentionally channel-neutral. Feishu therefore belongs in the
independent Channels repository rather than the OS runtime. The implementation
starts from the latest official Feishu source and records its exact revision so
future upstream updates can be compared without repeating a full rewrite.

## Key Decisions

- Use the current upstream main revision, not an older local migration.
- Preserve upstream capabilities while replacing product-specific integration.
- Version the YOS component independently as `0.1.0-alpha.1`.
- Build a standalone artifact from the monorepo component directory.
- Defer production Registry publication until independent acceptance.

## Rejected Alternative

The previous Channels repository was not used as implementation input. Its
contents belong to the earlier product line and would make provenance and
behavioral differences harder to audit.

## Verification Status

Implementation and verification are in progress. No real Feishu account has
been used and no package has been published.
