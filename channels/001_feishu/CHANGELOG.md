# Changelog

## 0.1.2 - 2026-08-09

- Keep Feishu SDK warnings out of `error.log`. Every SDK object is now built
  through one factory that attaches a logger writing warnings to stdout, so the
  routine `no im.message.reaction.created_v1 handle` line — emitted whenever
  someone reacts to a message — no longer fills the error log with what looks
  like a broken channel. Genuine errors still go to stderr.
- Say so when a display name cannot be resolved. A contact lookup that succeeds
  without returning a name (which is how Feishu reports a missing contact scope)
  previously fell back to the raw `ou_...` id in complete silence. The channel
  still falls back, but now explains why and names the scope to grant.

## 0.1.0-alpha.2 - 2026-08-05

- Run the component's own package contract on pack, matching the Weixin channel.
  Packing this component previously ran no check at all.
- Point the repository metadata at `yoyooai/yos-components`, its actual home.

Real Feishu acceptance is still outstanding, and `lark-cli` does not install
through the post-install hook without elevated npm permissions, so the
productivity surfaces are unavailable until that is resolved.

## 0.1.0-alpha.1 - Unreleased

- Imported the current Feishu 0.3.4 behavior baseline.
- Preserved WebSocket, webhook, messaging, media and lark-cli capabilities.
- Adapted paths, service names, commands and C4 integration to YOS.
- Added source provenance, package boundaries and security verification.

This version is not published and has not completed real Feishu acceptance.
