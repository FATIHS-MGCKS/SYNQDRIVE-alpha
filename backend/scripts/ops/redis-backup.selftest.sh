#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

# shellcheck source=lib/redis-backup-lib.sh
source "${SCRIPT_DIR}/lib/redis-backup-lib.sh"

export REDIS_BACKUP_ROOT="${ROOT}/redis"
export REDIS_BACKUP_ALLOW_UNENCRYPTED=true
export REDIS_BACKUP_SKIP_OFFSITE=true

redis_backup_defaults
redis_backup_ensure_dirs

STAGING="${REDIS_BACKUP_STAGING_DIR}/redis-daily-test.rdb"
printf 'REDIS' > "${STAGING}"
redis_backup_write_checksum_sidecar "${STAGING}" >/dev/null

redis_backup_promote_artifact "${STAGING}" >/dev/null
STAGING2="${REDIS_BACKUP_STAGING_DIR}/redis-daily-test.rdb"
printf 'REDIS' > "${STAGING2}"
if redis_backup_promote_artifact "${STAGING2}"; then
  echo "FAIL: should refuse overwrite" >&2
  exit 1
fi

echo "redis-backup selftest: OK"
