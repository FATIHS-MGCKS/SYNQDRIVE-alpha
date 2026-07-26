#!/usr/bin/env bash
#
# vps-backup-redis.sh — Redis RDB snapshot backup (BullMQ queue buffer).
#
# PostgreSQL remains System of Record. This backup preserves queue/coordination
# state across Redis restarts — NOT a substitute for Postgres DR.
#
# Pipeline:
#   1. redis-cli --rdb (online snapshot)
#   2. redis-check-rdb integrity
#   3. SHA-256 + optional GPG → shared archive
#   4. Offsite copy + safe rotation
#
# Configuration: /opt/synqdrive/shared/redis-backup.env
# Docs: docs/remediation/redis-backup.md
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/redis-backup-lib.sh
source "${SCRIPT_DIR}/lib/redis-backup-lib.sh"

redis_backup_defaults
redis_backup_load_env_file
redis_backup_load_backend_credentials
redis_backup_defaults

DRY_RUN=false
VERIFY_ONLY=""

usage() {
  cat <<'EOF'
Usage: vps-backup-redis.sh [options]

Options:
  --dry-run              Validate config (no snapshot)
  --verify-only <file>   Re-run integrity on archive
  -h, --help             Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --verify-only)
      VERIFY_ONLY="${2:-}"
      [[ -n "${VERIFY_ONLY}" ]] || redis_backup_die "--verify-only requires a file path"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) redis_backup_die "unknown argument: $1" ;;
  esac
done

redis_backup_ensure_dirs
redis_backup_validate_config

if [[ -n "${VERIFY_ONLY}" ]]; then
  redis_backup_log "verify-only: ${VERIFY_ONLY}"
  redis_backup_verify_artifact "${VERIFY_ONLY}"
  redis_backup_log "integrity OK"
  exit 0
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  redis_backup_log "DRY RUN — config OK"
  redis_backup_log "  redis:        ${REDIS_BACKUP_HOST}:${REDIS_BACKUP_PORT} db=${REDIS_BACKUP_DB}"
  redis_backup_log "  archive dir:  ${REDIS_BACKUP_ARCHIVE_DIR}"
  redis_backup_log "  dbsize:       $(redis_backup_cli DBSIZE)"
  redis_backup_log "  valid gens:   $(redis_backup_count_valid_archives)"
  exit 0
fi

redis_backup_check_disk

BASE_NAME="$(redis_backup_base_name)"
STAGING_RDB="${REDIS_BACKUP_STAGING_DIR}/${BASE_NAME}.rdb"
STAGING_FINAL=""

cleanup_staging() {
  rm -f "${STAGING_RDB}" "${STAGING_FINAL}"
}
trap cleanup_staging EXIT

redis_backup_log "starting snapshot label=${REDIS_BACKUP_LABEL} dbsize=$(redis_backup_cli DBSIZE)"
redis_backup_create_rdb_snapshot "${STAGING_RDB}"

if redis_backup_encryption_enabled; then
  STAGING_FINAL="${REDIS_BACKUP_STAGING_DIR}/${BASE_NAME}.rdb.gpg"
  redis_backup_encrypt_file "${STAGING_RDB}" "${STAGING_FINAL}"
  rm -f "${STAGING_RDB}"
else
  STAGING_FINAL="${STAGING_RDB}"
  STAGING_RDB=""
fi

CHECKSUM="$(redis_backup_write_checksum_sidecar "${STAGING_FINAL}")"
if ! ARCHIVE_PATH="$(redis_backup_promote_artifact "${STAGING_FINAL}")"; then
  redis_backup_die "failed to promote artifact"
fi
STAGING_FINAL=""

redis_backup_verify_artifact "${ARCHIVE_PATH}" || redis_backup_die "post-promote verify failed"

redis_backup_write_meta_json "${ARCHIVE_PATH}" "${CHECKSUM}"
redis_backup_append_manifest "${ARCHIVE_PATH}"
redis_backup_write_last_success "${ARCHIVE_PATH}" "${CHECKSUM}"

redis_backup_copy_offsite "${ARCHIVE_PATH}"
redis_backup_rotate_local

redis_backup_log "backup SUCCESS: ${ARCHIVE_PATH}"
redis_backup_log "valid generations: $(redis_backup_count_valid_archives)"
