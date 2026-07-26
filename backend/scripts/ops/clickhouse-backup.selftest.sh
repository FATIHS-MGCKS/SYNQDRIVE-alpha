#!/usr/bin/env bash
# CI-safe self-test for clickhouse-backup-lib (no Docker / ClickHouse required).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

# shellcheck source=lib/clickhouse-backup-lib.sh
source "${SCRIPT_DIR}/lib/clickhouse-backup-lib.sh"

export CH_BACKUP_ROOT="${ROOT}/clickhouse"
export CH_BACKUP_ALLOW_UNENCRYPTED=true
export CH_BACKUP_SKIP_OFFSITE=true

ch_backup_defaults
ch_backup_ensure_dirs

# Fake zip (unzip -t may fail on tiny file — skip zip test by using .zip.gpg path without gpg in verify list)
# Test promote refuse overwrite
STAGING="${CH_BACKUP_STAGING_DIR}/synqdrive-daily-20260101T000000Z.zip"
printf 'PK' > "${STAGING}"
ch_backup_write_checksum_sidecar "${STAGING}" >/dev/null

# verify_artifact needs unzip - skip full verify; test promote only
if ! ARCHIVE_PATH="$(ch_backup_promote_artifact "${STAGING}")"; then
  echo "FAIL: first promote" >&2
  exit 1
fi

STAGING2="${CH_BACKUP_STAGING_DIR}/synqdrive-daily-20260101T000000Z.zip"
printf 'PK' > "${STAGING2}"
if ARCHIVE_PATH="$(ch_backup_promote_artifact "${STAGING2}")"; then
  echo "FAIL: promote should refuse overwrite" >&2
  exit 1
fi

echo "clickhouse-backup selftest: OK"
