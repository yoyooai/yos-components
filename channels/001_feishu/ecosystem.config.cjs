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
    restart_delay: 5000,
    error_file: path.join(os.homedir(), 'yos/components/feishu/logs/error.log'),
    out_file: path.join(os.homedir(), 'yos/components/feishu/logs/out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
