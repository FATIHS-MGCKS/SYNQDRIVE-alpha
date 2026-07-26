#!/usr/bin/env bash
#
# vps-backup-clickhouse.sh — Production ClickHouse logical backup (VPS).
#
# Uses the EXISTING ClickHouse container and Disk('backups') mount only.
# Does NOT rebuild containers, change mounts, or modify Docker volumes.
#
# Pipeline:
#   1. BACKUP DATABASE via docker exec → existing /backups mount
#   2. Copy artifact to /opt/synqdrive/shared/backups/clickhouse/ (immutable)
#   3. Integrity: unzip -t + SHA-256 + system.backup_log (best-effort)
#   4. Optional GPG encryption + offsite (rclone/s3)
#   5. Safe rotation (never below CH_BACKUP_MIN_GENERATIONS valid archives)
#
# Configuration: /opt/synqdrive/shared/clickhouse-backup.env
# Docs: docs/remediation/clickhouse-backup.md
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/clickhouse-backup-lib.sh
source "${SCRIPT_DIR}/lib/clickhouse-backup-lib.sh"

ch_backup_defaults
ch_backup_load_env_file
ch_backup_load_backend_credentials
ch_backup_defaults

DRY_RUN=false
VERIFY_ONLY=""

usage() {
  cat <<'EOF'
Usage: vps-backup-clickhouse.sh [options]

Options:
  --dry-run              Validate config and print paths (no backup)
  --verify-only <file>   Re-run integrity checks on shared archive
  -h, --help             Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --verify-only)
      VERIFY_ONLY="${2:-}"
      [[ -n "${VERIFY_ONLY}" ]] || ch_backup_die "--verify-only requires a file path"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) ch_backup_die "unknown argument: $1" ;;
  esac
done

ch_backup_ensure_dirs
ch_backup_validate_config

if [[ -n "${VERIFY_ONLY}" ]]; then
  ch_backup_log "verify-only: ${VERIFY_ONLY}"
  ch_backup_verify_artifact "${VERIFY_ONLY}"
  ch_backup_log "integrity OK"
  exit 0
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  MOUNT="$(ch_backup_container_mount_path)"
  ch_backup_log "DRY RUN — config OK"
  ch_backup_log "  container:    ${CH_BACKUP_CONTAINER}"
  ch_backup_log "  mount:        ${MOUNT}"
  ch_backup_log "  archive dir:  ${CH_BACKUP_ARCHIVE_DIR}"
  ch_backup_log "  database:     ${CH_BACKUP_DATABASE}"
  ch_backup_log "  encryption:   $(ch_backup_encryption_enabled && echo yes || echo no)"
  ch_backup_log "  offsite:      ${CH_BACKUP_OFFSITE_MODE}"
  ch_backup_log "  valid gens:   $(ch_backup_count_valid_archives)"
  exit 0
fi

ch_backup_check_disk

ZIP_NAME="$(ch_backup_zip_name)"
MOUNT_PATH="$(ch_backup_container_mount_path)"
STAGING_ZIP="${CH_BACKUP_STAGING_DIR}/${ZIP_NAME}"
STAGING_FINAL=""
CONTAINER_ARTIFACT="${MOUNT_PATH}/${ZIP_NAME}"

cleanup_staging() {
  rm -f "${STAGING_ZIP}" "${STAGING_FINAL}"
}
trap cleanup_staging EXIT

EXISTING_VALID="$(ch_backup_count_valid_archives)"
ch_backup_log "starting backup label=${CH_BACKUP_LABEL} zip=${ZIP_NAME} valid_generations=${EXISTING_VALID}"

if [[ -e "${CONTAINER_ARTIFACT}" ]]; then
  ch_backup_die "refusing to run — container mount already has ${ZIP_NAME} (would overwrite)"
fi

ch_backup_run_logical_backup "${ZIP_NAME}"

ch_backup_log "waiting for backup file on mount: ${CONTAINER_ARTIFACT}"
for _ in $(seq 1 300); do
  if [[ -f "${CONTAINER_ARTIFACT}" && -s "${CONTAINER_ARTIFACT}" ]]; then
    break
  fi
  sleep 2
done
[[ -f "${CONTAINER_ARTIFACT}" && -s "${CONTAINER_ARTIFACT}" ]] || ch_backup_die "backup file not found on mount after timeout"

BACKUP_STATUS="$(ch_backup_query_backup_log_status "${ZIP_NAME}")"
if [[ -n "${BACKUP_STATUS}" && "${BACKUP_STATUS}" != "BACKUP_CREATED" && "${BACKUP_STATUS}" != "CREATED" ]]; then
  ch_backup_log "WARN: system.backup_log status=${BACKUP_STATUS}"
fi

cp "${CONTAINER_ARTIFACT}" "${STAGING_ZIP}"
ch_backup_verify_zip_integrity "${STAGING_ZIP}"

if ch_backup_encryption_enabled; then
  STAGING_FINAL="${CH_BACKUP_STAGING_DIR}/${ZIP_NAME}.gpg"
  ch_backup_encrypt_file "${STAGING_ZIP}" "${STAGING_FINAL}"
  rm -f "${STAGING_ZIP}"
  STAGING_ZIP=""
else
  STAGING_FINAL="${STAGING_ZIP}"
  STAGING_ZIP=""
fi

CHECKSUM="$(ch_backup_write_checksum_sidecar "${STAGING_FINAL}")"
if ! ARCHIVE_PATH="$(ch_backup_promote_artifact "${STAGING_FINAL}")"; then
  ch_backup_die "failed to promote artifact (refusing overwrite)"
fi
STAGING_FINAL=""

ch_backup_verify_artifact "${ARCHIVE_PATH}" || ch_backup_die "post-promote integrity check failed"

ch_backup_write_meta_json "${ARCHIVE_PATH}" "${CHECKSUM}" "${ZIP_NAME}"
ch_backup_append_manifest "${ARCHIVE_PATH}"
ch_backup_write_last_success "${ARCHIVE_PATH}" "${CHECKSUM}"

ch_backup_copy_offsite "${ARCHIVE_PATH}"
ch_backup_rotate_local
ch_backup_cleanup_container_mount "${MOUNT_PATH}" "${ZIP_NAME}"

ch_backup_log "backup SUCCESS: ${ARCHIVE_PATH}"
ch_backup_log "valid generations: $(ch_backup_count_valid_archives)"
ch_backup_log "topology unchanged — container/mounts/volumes not modified"
