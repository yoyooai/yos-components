# Changelog

## 0.1.7 - 2026-08-13

### Fixed

- Bundle all 27 Lark CLI sub-skills with the component, removing GitHub from
  the normal install and repair path.
- Keep the network fallback for damaged packages, but run it in a detached
  process group and terminate the full tree before checking installation
  completeness or returning to the caller.
- Record the upstream tag, commit, archive SHA-256 and MIT license for the
  vendored assets.

## 0.1.6 - 2026-08-13

### Fixed

- The post-install hook no longer signs off with "[post-install] Complete!"
  when the optional lark-cli add-on could not be installed. Ending on that line
  is what let `yos add feishu` print a green check over an install that had
  fetched none of its 27 sub-skills. The hook now names the reduced
  functionality and exits non-zero so the installer can tell a degraded setup
  from a clean one.
- Degrading and carrying on is unchanged: the developer-console steps and the
  webhook URL are still printed in full before the exit code is set, because a
  failure in an optional add-on must not cost the user the instructions they
  actually have to follow.

## 0.1.5 - 2026-08-11

- Preserve the existing first-private-message owner contract while moving DM
  authorization into a behavior-tested gate.
- Keep merged-forward reads behind that gate: rejected private senders cannot
  trigger `im.message.get`.
- Pin the nested merged-forward fetch budget to 12 and record the exact upstream
  archive URL alongside its commit and SHA-256.
- Repair missing lark-cli sub-skills even when the Feishu component version is
  already current. The GitHub asset fetch now has bounded retries and timeouts;
  npm-global-install and GitHub-fetch failures use different actionable codes.

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
