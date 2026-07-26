#!/usr/bin/env bash
# Write Prometheus textfile metric for last successful database backup.
#
# Call after pg_dump succeeds (deploy script, cron, manual backup).
#
# Usage:
#   bash vps-backup-status-textfile.sh [unix_timestamp]
#
# Default timestamp: now
set -euo pipefail

TEXTFILE_DIR="${TEXTFILE_DIR:-/opt/synqdrive/shared/node-exporter-textfile}"
TS="${1:-$(date +%s)}"
OUT="${TEXTFILE_DIR}/synqdrive_backup.prom"

mkdir -p "$TEXTFILE_DIR"

cat > "${OUT}.$$" <<EOF
# HELP synqdrive_backup_last_success_timestamp Unix timestamp of last successful PostgreSQL backup
# TYPE synqdrive_backup_last_success_timestamp gauge
synqdrive_backup_last_success_timestamp ${TS}
EOF

mv "${OUT}.$$" "$OUT"
chmod 644 "$OUT"
echo "Wrote backup metric: $OUT (timestamp=${TS})"
