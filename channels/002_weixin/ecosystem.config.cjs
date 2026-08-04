const os = require('node:os');
const path = require('node:path');

module.exports = {
  apps: [{
    name: 'yos-weixin',
    script: 'src/index.ts',
    cwd: path.join(os.homedir(), 'yos/.claude/skills/weixin'),
    env: { NODE_ENV: 'production' },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    error_file: path.join(os.homedir(), 'yos/components/weixin/logs/error.log'),
    out_file: path.join(os.homedir(), 'yos/components/weixin/logs/out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
