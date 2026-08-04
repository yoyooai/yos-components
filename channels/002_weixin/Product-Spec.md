# YOS Weixin Channel Product Spec

## Goal

Provide an independently installable personal Weixin channel for YOS by
retaining Tencent's audited iLink protocol implementation and replacing its
original host integration with the YOS C4 contract.

## Required Behavior

1. Log in through a terminal QR code without committing credentials.
2. Receive personal text messages by long-poll and preserve Tencent's cursor.
3. Deliver each inbound message to C4 using the original message ID.
4. Reply through the originating account and per-user context token.
5. Preserve account credentials, cursors and context tokens across restart.
6. Install, upgrade and remove independently of YOS Core and other channels.

## Security Requirements

- Account data stays under `~/yos/components/weixin` with private permissions.
- API traffic is restricted to credential-free HTTPS Weixin domains.
- C4 execution uses argument arrays, never a shell command string.
- Network and login failures expose stable messages, not upstream response bodies.
- Package creation rejects untracked, secret-like and private-path content.

## Not In Scope

- Group conversations.
- Image, voice, video or file delivery.
- Production Registry publication.
- A claim of real-platform readiness before independent QR/message/restart tests.
