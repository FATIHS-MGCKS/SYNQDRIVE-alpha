#!/usr/bin/env bash
#
# vps-clickhouse-backup.sh — Gate G1 backup with checksum (Phase 2D.7).
#
# Creates a ClickHouse BACKUP DATABASE archive on the backups disk and records
# sha256 + row-count metadata for rollback validation.
#
# Usage:
#   bash vps-clickhouse-backup.sh [--label pre-remediation]
#
# Exit: 0 success · 1 backup failed · 2 prerequisite error
#
set -euo pipefail

LABEL="${1:-pre-remediation}"
if [[ "${1:-}" == "--label" ]]; then
  LABEL="${2:-pre-remediation}"
fi

BACKEND_DIR="${BACKEND_DIR:-/opt/synqdrive/current/backend}"
SHARED_BACKUPS="${CLICKHOUSE_SHARED_BACKUPS:-/opt/synqdrive/shared/clickhouse/backups}"
MANIFEST_DIR="${CLICKHOUSE_BACKUP_MANIFEST_DIR:-/opt/synqdrive/shared/clickhouse/backup-manifests}"
DATABASE="${CLICKHOUSE_DATABASE:-synqdrive}"
CONTAINER="${CLICKHOUSE_CONTAINER:-synqdrive-clickhouse}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_NAME="g1_${LABEL}_${TS}.zip"
HEALTH_URL="${CLICKHOUSE_HEALTH_URL:-http://127.0.0.1:3001/api/v1/health/readiness}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [[ -f /opt/synqdrive/shared/clickhouse-backup.env ]]; then
  # shellcheck disable=SC1091
  set -a; source /opt/synqdrive/shared/clickhouse-backup.env; set +a
fi

ch_exec() {
  docker exec "$CONTAINER" clickhouse-client \
    --user "${CLICKHOUSE_USER:-synqdrive}" \
    ${CLICKHOUSE_PASSWORD:+--password "$CLICKHOUSE_PASSWORD"} "$@"
}

section() {
  echo ""
  echo "================================================================================"
  echo "== $*"
  echo "================================================================================"
}

section "Pre-backup health"
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  log "ERROR: container ${CONTAINER} not running"
  exit 2
fi
ch_exec --query "SELECT 1" >/dev/null
log "ClickHouse ping OK"

if command -v curl >/dev/null 2>&1; then
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    log "API readiness OK (${HEALTH_URL})"
  else
    log "WARN: readiness check failed — continuing backup (CH is up)"
  fi
fi

mkdir -p "$SHARED_BACKUPS" "$MANIFEST_DIR"
chmod 700 "$SHARED_BACKUPS" 2>/dev/null || true

section "Row-count baseline (pre-backup)"
TABLE_COUNTS="$(ch_exec --query "
  SELECT groupArray((table, total_rows))
  FROM (
    SELECT table, sum(rows) AS total_rows
    FROM system.parts
    WHERE database = '${DATABASE}' AND active
    GROUP BY table
    ORDER BY table
  )
  FORMAT TabSeparated
" 2>/dev/null || echo "")"
echo "$TABLE_COUNTS"

section "BACKUP DATABASE → Disk('backups', '${BACKUP_NAME}')"
if ! ch_exec --query "BACKUP DATABASE ${DATABASE} TO Disk('backups', '${BACKUP_NAME}')"; then
  log "ERROR: BACKUP DATABASE failed"
  exit 1
fi

BACKUP_HOST_PATH="${SHARED_BACKUPS}/${BACKUP_NAME}"
# Container writes to /backups — resolve host path
if [[ ! -f "$BACKUP_HOST_PATH" ]]; then
  # Fallback: release-relative mount before M3 migration
  FALLBACK="${BACKEND_DIR}/storage/clickhouse/backups/${BACKUP_NAME}"
  if [[ -f "$FALLBACK" ]]; then
    BACKUP_HOST_PATH="$FALLBACK"
    log "WARN: backup found at release-relative path — run topology remediation (M1/M3)"
  else
    log "ERROR: backup file not found at ${BACKUP_HOST_PATH} or ${FALLBACK}"
    exit 1
  fi
fi

CHECKSUM="$(sha256sum "$BACKUP_HOST_PATH" | awk '{print $1}')"
SIZE_BYTES="$(stat -c%s "$BACKUP_HOST_PATH" 2>/dev/null || stat -f%z "$BACKUP_HOST_PATH")"

MANIFEST="${MANIFEST_DIR}/${BACKUP_NAME}.manifest.json"
cat > "$MANIFEST" <<EOF
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "label": "${LABEL}",
  "database": "${DATABASE}",
  "backupFile": "${BACKUP_HOST_PATH}",
  "sha256": "${CHECKSUM}",
  "sizeBytes": ${SIZE_BYTES},
  "tableCounts": "$(echo "$TABLE_COUNTS" | tr '\n' ' ' | sed 's/"/\\"/g')"
}
EOF

echo "${CHECKSUM}  ${BACKUP_HOST_PATH}" > "${MANIFEST_DIR}/${BACKUP_NAME}.sha256"

section "Backup complete"
log "file=${BACKUP_HOST_PATH}"
log "sha256=${CHECKSUM}"
log "manifest=${MANIFEST}"
log "size_bytes=${SIZE_BYTES}"

exit 0
