const os = require('node:os');
const path = require('node:path');

module.exports = {
  apps: [{
    name: 'yos-weixin',
    script: 'src/index.ts',
    interpreter: 'node',
    cwd: path.join(os.homedir(), 'yos/.claude/skills/weixin'),
    env: { NODE_ENV: 'production' },
    autorestart: true,
    max_restarts: 10,
    // max_restarts only counts restarts that happened sooner than min_uptime
    // (PM2 default: 1s). Without this line the cap never fires — a start that
    // fails a second or two in, which is what missing credentials look like,
    // restarts forever. Measured: 57 restarts and climbing.
    min_uptime: '10s',
    restart_delay: 5000,
    error_file: path.join(os.homedir(), 'yos/components/weixin/logs/error.log'),
    out_file: path.join(os.homedir(), 'yos/components/weixin/logs/out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
