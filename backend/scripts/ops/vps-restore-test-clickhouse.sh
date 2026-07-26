#!/usr/bin/env bash
#
# vps-restore-test-clickhouse.sh — Restore drill for ClickHouse backups.
#
# Copies a verified shared archive to the existing Disk('backups') mount,
# restores into a separate database (default: synqdrive_restore_test), runs
# smoke queries, then drops the test database.
#
# Does NOT rebuild containers or change mounts/volumes.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/clickhouse-backup-lib.sh
source "${SCRIPT_DIR}/lib/clickhouse-backup-lib.sh"

ch_backup_defaults
ch_backup_load_env_file
ch_backup_load_backend_credentials
ch_backup_defaults

ARTIFACT=""
DROP_AFTER=false

usage() {
  cat <<'EOF'
Usage: vps-restore-test-clickhouse.sh [options]

Options:
  --artifact <path>  Shared archive (default: latest valid in daily/)
  --drop-after       Drop test database after smoke checks (default: keep)
  -h, --help         Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="${2:-}"; shift 2 ;;
    --drop-after) DROP_AFTER=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) ch_backup_die "unknown argument: $1" ;;
  esac
done

ch_backup_ensure_dirs
ch_backup_validate_config

if [[ -z "${ARTIFACT}" ]]; then
  ARTIFACT="$(ch_backup_list_valid_archives "${CH_BACKUP_ARCHIVE_DIR}" | tail -1)"
fi
[[ -n "${ARTIFACT}" && -f "${ARTIFACT}" ]] || ch_backup_die "no valid backup artifact found"

ch_backup_log "restore-test artifact: ${ARTIFACT}"
ch_backup_verify_artifact "${ARTIFACT}"

MOUNT_PATH="$(ch_backup_container_mount_path)"
RESTORE_ZIP_NAME="restore-test-$(date -u +%Y%m%dT%H%M%SZ).zip"
MOUNT_ZIP="${MOUNT_PATH}/${RESTORE_ZIP_NAME}"
TEMP_ZIP=""

cleanup() {
  rm -f "${TEMP_ZIP}" "${MOUNT_ZIP}"
}
trap cleanup EXIT

if [[ "${ARTIFACT}" == *.gpg ]]; then
  TEMP_ZIP="$(mktemp "${CH_BACKUP_STAGING_DIR}/restore-test.XXXXXX.zip")"
  if [[ -n "${CH_BACKUP_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --decrypt --output "${TEMP_ZIP}" "${ARTIFACT}"
  elif [[ -f "${CH_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --passphrase-file "${CH_BACKUP_GPG_PASSPHRASE_FILE}" \
      --decrypt --output "${TEMP_ZIP}" "${ARTIFACT}"
  else
    ch_backup_die "cannot decrypt artifact"
  fi
  cp "${TEMP_ZIP}" "${MOUNT_ZIP}"
else
  cp "${ARTIFACT}" "${MOUNT_ZIP}"
fi

ch_backup_verify_zip_integrity "${MOUNT_ZIP}"

TEST_DB="${CH_BACKUP_RESTORE_TEST_DB}"
ch_backup_log "preparing test database ${TEST_DB}"
ch_backup_client_query "DROP DATABASE IF EXISTS ${TEST_DB}"

ch_backup_log "RESTORE DATABASE ${TEST_DB} FROM Disk('${CH_BACKUP_DISK_NAME}', '${RESTORE_ZIP_NAME}')"
ch_backup_client_query "RESTORE DATABASE ${TEST_DB} FROM Disk('${CH_BACKUP_DISK_NAME}', '${RESTORE_ZIP_NAME}')"

TABLE_COUNT="$(ch_backup_client_query "SELECT count() FROM system.tables WHERE database = '${TEST_DB}'")"
ch_backup_log "smoke: tables in ${TEST_DB} = ${TABLE_COUNT}"

if [[ "${TABLE_COUNT}" == "0" ]]; then
  ch_backup_die "restore-test failed — no tables in ${TEST_DB}"
fi

cat > "${CH_BACKUP_STATE_DIR}/last-restore-test.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "artifact": "${ARTIFACT}",
  "test_database": "${TEST_DB}",
  "table_count": ${TABLE_COUNT}
}
EOF

if [[ "${DROP_AFTER}" == "true" ]]; then
  ch_backup_log "dropping test database ${TEST_DB}"
  ch_backup_client_query "DROP DATABASE IF EXISTS ${TEST_DB}"
fi

rm -f "${MOUNT_ZIP}"
TEMP_ZIP=""

ch_backup_log "restore-test SUCCESS"
