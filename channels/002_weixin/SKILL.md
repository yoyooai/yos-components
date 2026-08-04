---
name: weixin
version: 0.1.0-alpha.1
description: >-
  Personal Weixin direct-message communication channel for YOS. Use for QR
  login, receiving private Weixin text messages through C4, replying to the
  originating user, and checking account or service health. Config and account
  data live under ~/yos/components/weixin. Service: pm2 yos-weixin.
type: communication

lifecycle:
  npm: true
  service:
    type: pm2
    name: yos-weixin
    entry: src/index.ts
  data_dir: ~/yos/components/weixin
  hooks:
    post-install: hooks/post-install.js
    pre-upgrade: hooks/pre-upgrade.js
    post-upgrade: hooks/post-upgrade.js
  preserve:
    - config.json
    - accounts/
    - logs/

next-steps: "Run yos-weixin login in a terminal, scan the QR code with Weixin, then restart yos-weixin."

dependencies:
  - comm-bridge
---

# Weixin

## Login

```bash
yos-weixin login
pm2 restart yos-weixin
```

## Reply Contract

```bash
cat <<'EOF' | node ~/yos/.claude/skills/comm-bridge/scripts/c4-send.js "weixin" "<user-id>|account:<account-id>"
Hello from YOS
EOF
```

This alpha supports private text conversations. Do not claim group or media
support until those paths pass independent real-platform acceptance.
