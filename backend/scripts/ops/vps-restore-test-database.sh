#!/usr/bin/env bash
#
# vps-restore-test-database.sh — Non-destructive restore drill for PostgreSQL backups.
#
# Restores a backup into a separate database (default: synqdrive_restore_test),
# runs lightweight smoke queries, and optionally drops the test database.
#
# Usage:
#   bash backend/scripts/ops/vps-restore-test-database.sh
#   bash backend/scripts/ops/vps-restore-test-database.sh --artifact /path/to/backup.dump.gpg
#   bash backend/scripts/ops/vps-restore-test-database.sh --drop-after
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/postgresql-backup-lib.sh
source "${SCRIPT_DIR}/lib/postgresql-backup-lib.sh"

pg_backup_defaults
pg_backup_load_env_file
pg_backup_defaults

PG_BACKUP_RESTORE_TEST_DB="${PG_BACKUP_RESTORE_TEST_DB:-synqdrive_restore_test}"
ARTIFACT=""
DROP_AFTER=false

usage() {
  cat <<'EOF'
Usage: vps-restore-test-database.sh [options]

Options:
  --artifact <path>   Backup file to restore (default: latest valid in archive dir)
  --drop-after        Drop the test database after successful smoke checks
  -h, --help          Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    --drop-after) DROP_AFTER=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) pg_backup_die "unknown argument: $1" ;;
  esac
done

pg_backup_ensure_dirs
pg_backup_validate_config

if [[ -z "${ARTIFACT}" ]]; then
  ARTIFACT="$(pg_backup_list_valid_archives "${PG_BACKUP_ARCHIVE_DIR}" | tail -1)"
fi
[[ -n "${ARTIFACT}" && -f "${ARTIFACT}" ]] || pg_backup_die "no valid backup artifact found"

pg_backup_log "restore-test artifact: ${ARTIFACT}"
pg_backup_verify_artifact "${ARTIFACT}"

RESTORE_SOURCE="${ARTIFACT}"
TEMP_DUMP=""

cleanup() {
  rm -f "${TEMP_DUMP}"
}
trap cleanup EXIT

if [[ "${ARTIFACT}" == *.gpg ]]; then
  TEMP_DUMP="$(mktemp "${PG_BACKUP_STAGING_DIR}/restore-test.XXXXXX.dump")"
  if [[ -n "${PG_BACKUP_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --decrypt --output "${TEMP_DUMP}" "${ARTIFACT}"
  elif [[ -f "${PG_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --passphrase-file "${PG_BACKUP_GPG_PASSPHRASE_FILE}" \
      --decrypt --output "${TEMP_DUMP}" "${ARTIFACT}"
  else
    pg_backup_die "cannot decrypt ${ARTIFACT}"
  fi
  RESTORE_SOURCE="${TEMP_DUMP}"
fi

pg_backup_log "recreating test database ${PG_BACKUP_RESTORE_TEST_DB}"
pg_backup_run_as_postgres psql -v ON_ERROR_STOP=1 postgres <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${PG_BACKUP_RESTORE_TEST_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${PG_BACKUP_RESTORE_TEST_DB};
CREATE DATABASE ${PG_BACKUP_RESTORE_TEST_DB};
SQL

pg_backup_log "restoring into ${PG_BACKUP_RESTORE_TEST_DB}"
pg_backup_run_as_postgres pg_restore \
  --no-owner \
  --no-acl \
  --dbname="${PG_BACKUP_RESTORE_TEST_DB}" \
  "${RESTORE_SOURCE}"

pg_backup_log "running smoke queries"
ORG_COUNT="$(pg_backup_run_as_postgres psql -tA -d "${PG_BACKUP_RESTORE_TEST_DB}" -c 'SELECT COUNT(*) FROM organizations' 2>/dev/null || echo 'NA')"
MIGRATION_COUNT="$(pg_backup_run_as_postgres psql -tA -d "${PG_BACKUP_RESTORE_TEST_DB}" -c "SELECT COUNT(*) FROM _prisma_migrations" 2>/dev/null || echo 'NA')"

pg_backup_log "smoke: organizations=${ORG_COUNT} prisma_migrations=${MIGRATION_COUNT}"

cat > "${PG_BACKUP_STATE_DIR}/last-restore-test.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "artifact": "${ARTIFACT}",
  "test_database": "${PG_BACKUP_RESTORE_TEST_DB}",
  "organizations_count": "${ORG_COUNT}",
  "prisma_migrations_count": "${MIGRATION_COUNT}"
}
EOF

if [[ "${DROP_AFTER}" == "true" ]]; then
  pg_backup_log "dropping test database ${PG_BACKUP_RESTORE_TEST_DB}"
  pg_backup_run_as_postgres psql -v ON_ERROR_STOP=1 postgres -c "DROP DATABASE IF EXISTS ${PG_BACKUP_RESTORE_TEST_DB};"
fi

pg_backup_log "restore-test SUCCESS"
