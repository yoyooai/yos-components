# Changelog

## 0.1.4 - 2026-08-09

- Absorb the reviewed message-reading changes from upstream Feishu `0.3.5`:
  interactive cards, audio, media, stickers, quoted rich messages and merged
  forwards now retain readable content instead of generic placeholders.
- Resolve nested merged forwards with bounded depth and fetch counts. A failed
  Feishu read-back is reported as failed content rather than a false empty
  conversation.
- Defer merged-forward API reads until YOS DM/group access checks have passed.
  Existing owner binding, group policy and C4 delivery behavior are unchanged.
- Keep unknown card payloads out of service logs while retaining a fixed
  diagnostic and safe placeholder.

## 0.1.3 - 2026-08-09

- Stop asking during an install that promised not to ask. `yos add feishu -y`
  could sit on `Choose mode [1/2]` forever: this hook decided whether to prompt
  from `process.stdin.isTTY` alone, so the `--yes` the customer passed was
  honoured by the CLI and then ignored here, on the same terminal. The core now
  passes `YOS_ASSUME_YES` and `mayAskInteractively()` respects it.
- Answer npx before naming the package. `npx xc-skills@latest ... -y` put `-y`
  after the package name, making it an argument for xc-skills while npx kept
  its own `Ok to proceed?` question — the last thing standing between an
  unattended install and finishing.
- Say which connection mode a non-interactive install picked, and where to
  change it. Choosing in silence left an unattended machine on a mode nobody
  selected and nobody was told about.
- Make a split brain diagnosable. Feishu delivers each event to exactly one
  long connection, so the same App ID on two machines produces one bot that
  contradicts itself while both logs look normal read on their own. The
  platform does not tell a client how many connections an app has, so this
  cannot be detected here and does not pretend to be: instead startup names
  this instance (host, pid, App ID fingerprint) and states the trap, and every
  handled message is stamped with the machine that handled it.

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
