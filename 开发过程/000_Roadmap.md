# YOS Channels Roadmap

| Stage | Scope | Status |
|---|---|---|
| 0 | Repository boundary and independent channel policy | Complete |
| 1 | Feishu upstream lock and repository contracts | Complete |
| 2 | Feishu runtime import and YOS adaptation | Complete |
| 3 | Package and isolated lifecycle verification | Complete |
| 4 | XiaoA independent real Feishu acceptance | Pending |
| 5 | Immutable artifact, component tag and Registry publication | Pending |
| 6 | Weixin upstream lock and YOS adaptation | Complete |
| 7 | XiaoA independent real Weixin acceptance | Pending |
| 8 | Repository test-guard self-protection | Development complete; independent acceptance pending |
| 9 | Repository test-gate final-result enforcement | Development complete; independent acceptance pending |
| 10 | Executed-test gate returns raw data only; outer verification owns the verdict | Development complete; independent acceptance pending |
| 11 | Feishu upstream 0.3.5 rich-message and merge-forward sync | Development complete; independent acceptance pending |

The first formal component is `channels/001_feishu`. Other channels may be
developed on isolated branches while an earlier channel is under review, but
each channel must pass its own acceptance and release gates before publication.
