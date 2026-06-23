#!/usr/bin/env bash
#
# clickhouse-backup-local.sh
#
# Creates a LOCAL ClickHouse backup of the SynqDrive analytics database and
# writes it to the local backup disk (Disk('backups', ...)), bind-mounted to
# backend/storage/clickhouse/backups on the host.
#
# Phase 1: local-only backups, retained for a maximum of 7 days.
# No S3 / cloud logic on purpose.
#
# Run from the backend/ directory:
#   ./scripts/clickhouse-backup-local.sh
#   npm run clickhouse:backup:local

set -euo pipefail

# Resolve the backend/ directory regardless of the caller's cwd, then operate
# from there so docker compose picks up backend/docker-compose.yml.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-synqdrive}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-synqdrive_clickhouse_dev}"

BACKUP_DIR="./storage/clickhouse/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_NAME="synqdrive_${TIMESTAMP}.zip"
RETENTION_DAYS=7

echo "==> ClickHouse local backup starting"
echo "    Database : ${CLICKHOUSE_DATABASE}"
echo "    Backup   : ${BACKUP_NAME}"

# Ensure the host-side backup directory exists.
mkdir -p "${BACKUP_DIR}"

# Run the backup. The backup disk 'backups' is defined in
# docker/clickhouse/config.d/backup_disk.xml and maps to /backups (== BACKUP_DIR).
if ! docker compose exec -T clickhouse clickhouse-client \
  --user "${CLICKHOUSE_USER}" \
  --password "${CLICKHOUSE_PASSWORD}" \
  --query "BACKUP DATABASE ${CLICKHOUSE_DATABASE} TO Disk('backups', '${BACKUP_NAME}')"; then
  echo "!! Backup FAILED — is ClickHouse running? (docker compose up -d clickhouse)" >&2
  exit 1
fi

echo "==> Backup completed: ${BACKUP_DIR}/${BACKUP_NAME}"

# Retention: delete local backups older than RETENTION_DAYS.
echo "==> Cleaning up backups older than ${RETENTION_DAYS} days"
DELETED="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'synqdrive_*.zip' -mtime "+${RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
echo "    Removed ${DELETED} expired backup(s)"

echo "==> Done."
