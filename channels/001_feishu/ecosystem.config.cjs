const path = require('path');
const os = require('os');

module.exports = {
  apps: [{
    name: 'yos-feishu',
    script: 'src/index.js',
    cwd: path.join(os.homedir(), 'yos/.claude/skills/feishu'),
    env: {
      NODE_ENV: 'production'
    },
    autorestart: true,
    max_restarts: 10,
    // max_restarts only counts restarts that happened sooner than min_uptime
    // (PM2 default: 1s). Without this line the cap never fires — a start that
    // fails a second or two in, which is what missing credentials look like,
    // restarts forever. Measured: 57 restarts and climbing.
    min_uptime: '10s',
    restart_delay: 5000,
    error_file: path.join(os.homedir(), 'yos/components/feishu/logs/error.log'),
    out_file: path.join(os.homedir(), 'yos/components/feishu/logs/out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
