# Changelog

## 0.1.3 - 2026-08-10

- Declare the `communication.message` capability for read-only YOS capability
  discovery. Runtime messaging, credentials and owner binding are unchanged.
- Add a repository release gate that rejects changed package contents under an
  already published component version.

## 0.1.0-alpha.3 - 2026-08-05

- Declare `yos-weixin` under `bin` in SKILL.md, and ship a `scripts/login.js`
  entry for it. YOS links commands from SKILL.md, never from package.json's own
  `bin` — components install as skill directories, so npm never links that one.
  The post-install note has been telling users to run a command that did not
  exist; on a real install it was "command not found", with no way forward.
- Keep replacing an unscanned QR code for far longer (30 tries, or
  `WEIXIN_QR_MAX_REFRESH`). Three assumed the person scanning was sitting at this
  terminal; when the server is remote the code has to be relayed to whoever holds
  the phone, and the login used to exit mid-hand-off. A replacement now also says
  the previous link is dead, since the relayed one may still be in someone's hand.

A real-person QR login has been completed against 0.1.0-alpha.2 and messages were
delivered, so this channel is no longer unproven — but it has not run for a full
day, and login had to be started by hand because of the missing command above.

## 0.1.0-alpha.2 - 2026-08-05

- Point the repository metadata at `yoyooai/yos-components`, its actual home.

A real-person QR login has still not been performed, so this alpha is not known
to deliver or receive live messages.

## 0.1.0-alpha.1 - 2026-08-04

- Lock Tencent's Weixin channel v2.4.6 protocol implementation.
- Add QR login with private per-account credential storage.
- Add direct-message long polling and YOS C4 delivery.
- Add text replies using the original Weixin context token.
- Add YOS component lifecycle and package boundaries.

This alpha does not claim group-chat or media delivery support.
