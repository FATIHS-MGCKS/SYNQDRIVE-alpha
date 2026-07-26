#!/usr/bin/env bash
#
# vps-backup-database.sh — Production PostgreSQL backup for SynqDrive VPS.
#
# Features:
#   - MVCC-consistent pg_dump (custom format)
#   - Integrity verification (pg_restore --list + SHA-256 sidecar)
#   - GPG encryption (asymmetric recipient or symmetric passphrase file)
#   - Immutable timestamped generations (never overwrites)
#   - Rotation only when >= PG_BACKUP_MIN_GENERATIONS valid archives remain
#   - Optional offsite copy (rclone or aws s3)
#
# Usage:
#   bash backend/scripts/ops/vps-backup-database.sh
#   PG_BACKUP_LABEL=pre-deploy PG_BACKUP_SKIP_ROTATION=true bash .../vps-backup-database.sh
#
# Configuration: /opt/synqdrive/shared/postgresql-backup.env
# See: backend/scripts/ops/postgresql-backup.env.example
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/postgresql-backup-lib.sh
source "${SCRIPT_DIR}/lib/postgresql-backup-lib.sh"

pg_backup_defaults
pg_backup_load_env_file
pg_backup_defaults

DRY_RUN=false
VERIFY_ONLY=""

usage() {
  cat <<'EOF'
Usage: vps-backup-database.sh [options]

Options:
  --dry-run       Validate configuration and print planned paths (no dump)
  --verify-only <artifact>  Re-run integrity checks on an existing archive
  -h, --help      Show this help

Environment / config file: postgresql-backup.env (see postgresql-backup.env.example)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --verify-only)
      VERIFY_ONLY="${2:-}"
      [[ -n "${VERIFY_ONLY}" ]] || pg_backup_die "--verify-only requires a file path"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) pg_backup_die "unknown argument: $1" ;;
  esac
done

pg_backup_ensure_dirs
pg_backup_validate_config

if [[ -n "${VERIFY_ONLY}" ]]; then
  pg_backup_log "verify-only: ${VERIFY_ONLY}"
  pg_backup_verify_artifact "${VERIFY_ONLY}"
  pg_backup_log "integrity OK"
  exit 0
fi

pg_backup_check_disk

BASE_NAME="$(pg_backup_base_name)"
STAGING_PLAIN="${PG_BACKUP_STAGING_DIR}/${BASE_NAME}.dump"
STAGING_FINAL=""

cleanup_staging() {
  rm -f "${STAGING_PLAIN}" "${STAGING_FINAL}"
}
trap cleanup_staging EXIT

if [[ "${DRY_RUN}" == "true" ]]; then
  pg_backup_log "DRY RUN — config OK"
  pg_backup_log "  archive dir: ${PG_BACKUP_ARCHIVE_DIR}"
  pg_backup_log "  label:       ${PG_BACKUP_LABEL}"
  pg_backup_log "  encryption:  $(pg_backup_encryption_enabled && echo yes || echo no)"
  pg_backup_log "  offsite:     ${PG_BACKUP_OFFSITE_MODE}"
  pg_backup_log "  valid gens:  $(pg_backup_count_valid_archives)"
  exit 0
fi

EXISTING_VALID="$(pg_backup_count_valid_archives)"
pg_backup_log "starting backup label=${PG_BACKUP_LABEL} valid_generations=${EXISTING_VALID}"

pg_backup_create_dump "${STAGING_PLAIN}"

if pg_backup_encryption_enabled; then
  STAGING_FINAL="${PG_BACKUP_STAGING_DIR}/${BASE_NAME}.dump.gpg"
  pg_backup_encrypt_file "${STAGING_PLAIN}" "${STAGING_FINAL}"
  rm -f "${STAGING_PLAIN}"
  STAGING_PLAIN=""
else
  STAGING_FINAL="${STAGING_PLAIN}"
fi

pg_backup_log "verifying staging artifact"
if pg_backup_encryption_enabled; then
  temp_verify="$(pg_backup_decrypt_to_temp "${STAGING_FINAL}")"
  pg_backup_verify_custom_dump "${temp_verify}"
  rm -f "${temp_verify}"
else
  pg_backup_verify_custom_dump "${STAGING_FINAL}"
fi

CHECKSUM="$(pg_backup_write_checksum_sidecar "${STAGING_FINAL}")"
if ! ARCHIVE_PATH="$(pg_backup_promote_artifact "${STAGING_FINAL}")"; then
  pg_backup_die "failed to promote artifact (refusing overwrite)"
fi
STAGING_FINAL=""

pg_backup_log "verifying promoted archive"
pg_backup_verify_artifact "${ARCHIVE_PATH}" || pg_backup_die "post-promote integrity check failed"

pg_backup_write_meta_json "${ARCHIVE_PATH}" "${CHECKSUM}"
pg_backup_append_manifest "${ARCHIVE_PATH}" "${CHECKSUM}"
pg_backup_write_last_success "${ARCHIVE_PATH}" "${CHECKSUM}"

pg_backup_copy_offsite "${ARCHIVE_PATH}"
pg_backup_rotate_local
pg_backup_cleanup_staging

pg_backup_log "backup SUCCESS: ${ARCHIVE_PATH}"
pg_backup_log "valid generations: $(pg_backup_count_valid_archives)"
