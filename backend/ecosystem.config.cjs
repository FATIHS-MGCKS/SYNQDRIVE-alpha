/**
 * PM2 process definition for the SynqDrive single-fork runtime (API + workers).
 *
 * Applied via `vps-deploy-release.sh` (`pm2 reload` / `pm2 start`).
 * Caps bootstrap crash loops (min_uptime + max_restarts + exponential backoff).
 */
module.exports = {
  apps: [
    {
      name: 'synqdrive',
      script: 'dist/src/main.js',
      cwd: __dirname,
      exec_mode: 'fork',
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 5,
      exp_backoff_restart_delay: 2000,
      watch: false,
    },
  ],
};
