#!/usr/bin/env bash
#
# clickhouse-restore-local.sh
#
# Restores a LOCAL ClickHouse backup created by clickhouse-backup-local.sh.
#
# Usage (from backend/):
#   ./scripts/clickhouse-restore-local.sh synqdrive_YYYYMMDD_HHMMSS.zip
#   npm run clickhouse:restore:local -- synqdrive_YYYYMMDD_HHMMSS.zip
#
# Safety:
#   - Does NOT drop or delete any data.
#   - Does NOT force-overwrite existing tables. If the database/tables already
#     exist, ClickHouse will refuse the restore and the error is surfaced on
#     purpose so the operator can decide what to do.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-synqdrive}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-synqdrive_clickhouse_dev}"

BACKUP_DIR="./storage/clickhouse/backups"

BACKUP_NAME="${1:-}"
if [[ -z "${BACKUP_NAME}" ]]; then
  echo "Usage: ./scripts/clickhouse-restore-local.sh synqdrive_YYYYMMDD_HHMMSS.zip" >&2
  exit 1
fi

# Reject path traversal / nested paths — only a plain filename is allowed.
if [[ "${BACKUP_NAME}" == */* ]]; then
  echo "!! Provide only the backup filename, not a path: ${BACKUP_NAME}" >&2
  exit 1
fi

if [[ ! -f "${BACKUP_DIR}/${BACKUP_NAME}" ]]; then
  echo "!! Backup file not found: ${BACKUP_DIR}/${BACKUP_NAME}" >&2
  echo "   Available backups:" >&2
  ls -1 "${BACKUP_DIR}"/synqdrive_*.zip 2>/dev/null >&2 || echo "   (none)" >&2
  exit 1
fi

echo "==> ClickHouse local restore starting"
echo "    Database : ${CLICKHOUSE_DATABASE}"
echo "    Backup   : ${BACKUP_NAME}"

# Restore. Intentionally no DROP / overwrite. If tables already exist this will
# fail and the error stays visible to the operator.
if ! docker compose exec -T clickhouse clickhouse-client \
  --user "${CLICKHOUSE_USER}" \
  --password "${CLICKHOUSE_PASSWORD}" \
  --query "RESTORE DATABASE ${CLICKHOUSE_DATABASE} FROM Disk('backups', '${BACKUP_NAME}')"; then
  echo "!! Restore FAILED." >&2
  echo "   If this is due to existing tables, the database already holds data." >&2
  echo "   No data was dropped. Inspect manually before retrying." >&2
  exit 1
fi

echo "==> Restore completed from ${BACKUP_DIR}/${BACKUP_NAME}"
echo "==> Done."
