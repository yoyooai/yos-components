# YOS Channels

YOS Channels contains independently installable communication adapters for
YOS. Each adapter connects one external messaging platform to the stable YOS
component contract without adding platform-specific logic to the OS core.

## Status

The repository contains one development candidate. No channel is published.

| Channel | Component | Version | Development | Independent acceptance | Published |
|---|---|---:|---|---|---|
| Feishu | `channels/001_feishu` | `0.1.0-alpha.1` | Complete | Pending | No |

Feishu is installable from its local package for isolated verification. It is
not a production Registry component and must not be presented to users as a
released channel until independent real-platform acceptance is complete.

## Repository Boundary

- Channel implementations live under `channels/<channel-name>/`.
- Each channel owns its manifest, runtime code, tests, version and release tag.
- Credentials and customer data must never be committed.
- YOS core runtime, memory, task and upgrade logic remain in the `YOS` repository.
- A channel becomes installable only after independent verification, packaging
  and Registry publication.

## Planned Workflow

```text
upstream candidate
  -> provenance review
  -> brand and private-data cleanup
  -> YOS component-contract adaptation
  -> automated and real-platform verification
  -> immutable release artifact and channel tag
  -> Registry publication
```

## Development Verification

```bash
PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" npm run verify
```

See [the Feishu verification record](开发过程/002_Test_飞书渠道自测.md) for
the exact evidence and untested boundaries.

## License

YOS Channels is distributed under the terms in [LICENSE](LICENSE).
