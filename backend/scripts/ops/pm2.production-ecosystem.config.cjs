/**
 * Canonical PM2 production topology — two independent fork replicas (P1.8.2.1).
 * cwd/script resolve via /opt/synqdrive/current at runtime (symlink switched before reload).
 */
const path = require('node:path');

const backendDir = path.join('/opt/synqdrive/current', 'backend');
const mainScript = path.join(backendDir, 'dist/src/main.js');

module.exports = {
  apps: [
    {
      name: 'synqdrive',
      script: mainScript,
      cwd: backendDir,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      env: {
        PORT: '3001',
      },
    },
    {
      name: 'synqdrive-b',
      script: mainScript,
      cwd: backendDir,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      env: {
        PORT: '3002',
        INSTANCE_ID: 'replica-b',
      },
    },
  ],
};
