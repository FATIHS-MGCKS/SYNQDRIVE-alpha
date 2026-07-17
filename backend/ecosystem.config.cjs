/**
 * PM2 process definitions for SynqDrive.
 *
 * Default (DOCUMENT_EXTRACTION_WORKER_SPLIT unset/false): single fork `synqdrive` (API + all workers).
 * Split mode (DOCUMENT_EXTRACTION_WORKER_SPLIT=true in shared backend.env):
 *   - synqdrive — API + fleet workers (no document.extraction consumer)
 *   - synqdrive-document-worker — document.extraction processor + recovery scheduler only
 *
 * Rollback: set DOCUMENT_EXTRACTION_WORKER_SPLIT=false and `pm2 reload ecosystem.config.cjs`.
 */
const splitEnabled = process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT === 'true';

const sharedPm2Options = {
  cwd: __dirname,
  exec_mode: 'fork',
  autorestart: true,
  min_uptime: '10s',
  max_restarts: 5,
  exp_backoff_restart_delay: 2000,
  watch: false,
};

/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    ...sharedPm2Options,
    name: 'synqdrive',
    script: 'dist/src/main.js',
    env: {
      SYNQDRIVE_PROCESS_ROLE: splitEnabled ? 'api' : 'all',
    },
  },
];

if (splitEnabled) {
  apps.push({
    ...sharedPm2Options,
    name: 'synqdrive-document-worker',
    script: 'dist/src/main-document-worker.js',
    env: {
      SYNQDRIVE_PROCESS_ROLE: 'document-worker',
      DOCUMENT_EXTRACTION_WORKER_SPLIT: 'true',
    },
  });
}

module.exports = { apps };
