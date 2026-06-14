#!/usr/bin/env bash
# ============================================================================
# SynqDrive — Cap application & system log growth on the VPS
# ----------------------------------------------------------------------------
# Two sources can fill the disk with logs:
#   1. PM2 process logs (~/.pm2/logs/*.log) — capped via pm2-logrotate.
#   2. systemd journal (journald) — capped via SystemMaxUse.
#
# Run once on the VPS (idempotent). Safe — only touches log rotation config.
#   ./backend/scripts/ops/setup-log-limits.sh
# ============================================================================
set -euo pipefail

echo "==> Configuring pm2-logrotate"
if command -v pm2 >/dev/null 2>&1; then
  pm2 install pm2-logrotate || true
  # Rotate at 50M, keep 14 files, compress, rotate daily.
  pm2 set pm2-logrotate:max_size 50M
  pm2 set pm2-logrotate:retain 14
  pm2 set pm2-logrotate:compress true
  pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
  pm2 save || true
else
  echo "!! pm2 not found — skipping pm2-logrotate (install PM2 first)"
fi

echo "==> Capping systemd journal size (requires sudo)"
JOURNALD_CONF="/etc/systemd/journald.conf.d/synqdrive.conf"
if [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO mkdir -p /etc/systemd/journald.conf.d
  $SUDO tee "$JOURNALD_CONF" >/dev/null <<'EOF'
[Journal]
SystemMaxUse=1G
SystemKeepFree=2G
MaxRetentionSec=2week
EOF
  $SUDO systemctl restart systemd-journald || true
  echo "   journald limited (SystemMaxUse=1G, 2w retention)"
else
  echo "!! no root/sudo — set ${JOURNALD_CONF} manually"
fi

echo "==> Log limits configured."
echo "   Reminder: set LOG_LEVEL=error,warn,log (and NODE_ENV=production) in the backend env"
echo "   so the app itself stops emitting debug-level volume."
