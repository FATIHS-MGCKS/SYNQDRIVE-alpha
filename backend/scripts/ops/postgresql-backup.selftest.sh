#!/usr/bin/env bash
# CI-safe self-test for postgresql-backup-lib promote/overwrite guard.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

# shellcheck source=lib/postgresql-backup-lib.sh
source "${SCRIPT_DIR}/lib/postgresql-backup-lib.sh"

export PG_BACKUP_ROOT="${ROOT}/postgresql"
export PG_BACKUP_ALLOW_UNENCRYPTED=true

pg_backup_defaults
pg_backup_ensure_dirs

STAGING="${PG_BACKUP_STAGING_DIR}/synqdrive-daily-test.dump"
printf 'PGDMP' > "${STAGING}"
pg_backup_write_checksum_sidecar "${STAGING}" >/dev/null
pg_backup_promote_artifact "${STAGING}" >/dev/null

STAGING2="${PG_BACKUP_STAGING_DIR}/synqdrive-daily-test.dump"
printf 'PGDMP' > "${STAGING2}"
if pg_backup_promote_artifact "${STAGING2}"; then
  echo "FAIL: promote should refuse overwrite" >&2
  exit 1
fi

echo "postgresql-backup selftest: OK"
