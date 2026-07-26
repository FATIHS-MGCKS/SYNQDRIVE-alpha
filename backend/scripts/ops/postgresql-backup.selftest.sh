#!/usr/bin/env bash
# Lightweight self-test for postgresql-backup-lib (no database required).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

# shellcheck source=lib/postgresql-backup-lib.sh
source "${SCRIPT_DIR}/lib/postgresql-backup-lib.sh"

export PG_BACKUP_ROOT="${ROOT}/postgresql"
export PG_BACKUP_ALLOW_UNENCRYPTED=true
export PG_BACKUP_SKIP_OFFSITE=true
export PG_BACKUP_SKIP_ROTATION=false
export PG_BACKUP_LOCAL_RETENTION_DAYS=0
export PG_BACKUP_MIN_GENERATIONS=2

pg_backup_defaults
pg_backup_ensure_dirs

# Create minimal fake "custom" dumps — integrity verify will fail, so test checksum + promote only.
FAKE1="${PG_BACKUP_ARCHIVE_DIR}/synqdrive-daily-20260101T000000Z.dump"
FAKE2="${PG_BACKUP_ARCHIVE_DIR}/synqdrive-daily-20260102T000000Z.dump"
printf 'PGDMP' > "${FAKE1}"
printf 'PGDMP' > "${FAKE2}"
pg_backup_write_checksum_sidecar "${FAKE1}" >/dev/null
pg_backup_write_checksum_sidecar "${FAKE2}" >/dev/null

# Promote must refuse overwrite
STAGING="${PG_BACKUP_STAGING_DIR}/synqdrive-manual-test.dump"
printf 'PGDMP' > "${STAGING}"
pg_backup_promote_artifact "${STAGING}" >/dev/null
STAGING2="${PG_BACKUP_STAGING_DIR}/synqdrive-manual-test.dump"
printf 'PGDMP' > "${STAGING2}"
if ARCHIVE_PATH="$(pg_backup_promote_artifact "${STAGING2}")"; then
  echo "FAIL: promote should refuse overwrite" >&2
  exit 1
fi

echo "postgresql-backup selftest: OK"
