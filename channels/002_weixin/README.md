# YOS Weixin Channel

Personal Weixin direct-message channel for YOS, adapted from Tencent's official
`openclaw-weixin` protocol implementation.

## Current Alpha Scope

- QR-code login and multiple local account records.
- Direct text messages into the YOS C4 queue.
- Text replies routed to the originating Weixin account and user.
- Persistent long-poll cursor and context token across service restarts.
- Private component data under `~/yos/components/weixin/`.

Group chat and media delivery are not claimed in this alpha.

## Setup

```bash
yos add ./yos-weixin-0.1.0-alpha.1.tgz
yos-weixin login
pm2 restart yos-weixin
```

Scan the terminal QR code with Weixin and confirm on the phone. Account tokens
are stored locally with mode `0600`; they are never written to the package or
repository.

## Status

```bash
yos-weixin status
pm2 status yos-weixin
```

Use `yos remove weixin --purge` to remove both the channel and its local data.
