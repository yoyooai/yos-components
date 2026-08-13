# YOS Feishu Channel

The Feishu channel connects Feishu private chats and group conversations to
YOS through the C4 communication contract. It supports WebSocket and webhook
connections, text, cards, images, files, access policies and the bundled
`lark-cli` productivity capabilities.

## Status

- Component version: `0.1.7` candidate
- Upstream behavior baseline: `0.3.5`
- YOS Core contract: `>=0.1.0-alpha.1 <0.2.0`
- Publication: not published
- Real Feishu acceptance: pending independent verification

## Local Package Workflow

```bash
cd channels/001_feishu
npm ci
npm test
npm pack --ignore-scripts
yos add ./yos-feishu-0.1.7.tgz
```

The package requires `FEISHU_APP_ID` and `FEISHU_APP_SECRET`. Store them in
the YOS environment file or provide them through the YOS component installer;
never add them to this repository.

## Connection Modes

- `websocket`: Feishu long connection, no public callback URL required.
- `webhook`: HTTP callback at `/feishu/webhook`, requiring a public HTTPS route
  and Feishu verification token.

## Operational Paths

- Component source: `~/yos/.claude/skills/feishu`
- Persistent data: `~/yos/components/feishu`
- Service: `yos-feishu`
- C4 endpoint: `feishu`

## Current Boundary

The current YOS Registry resolves repository-root components and cannot yet
select a monorepo subdirectory artifact. This channel can be built and installed
as a standalone package, but Registry publication remains a separate release
step. Do not describe the component as publicly installable until that step and
the real Feishu acceptance are complete.
