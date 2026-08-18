#!/usr/bin/env bash
#
# vps-backup-postgresql.sh — PostgreSQL logical backup (production VPS).
#
# Pipeline:
#   1. pg_dump -Fc → staging
#   2. pg_restore --list integrity
#   3. GPG encrypt → immutable daily archive
#   4. SHA-256 sidecar + safe rotation
#
# Configuration: /opt/synqdrive/shared/postgresql-backup.env
# Shared GPG:      /opt/synqdrive/shared/backup-gpg.env
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/postgresql-backup-lib.sh
source "${SCRIPT_DIR}/lib/postgresql-backup-lib.sh"

pg_backup_defaults
pg_backup_load_env_file
pg_backup_load_backend_credentials
pg_backup_defaults

DRY_RUN=false
VERIFY_ONLY=""

usage() {
  cat <<'EOF'
Usage: vps-backup-postgresql.sh [options]

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
      [[ -n "${VERIFY_ONLY}" ]] || pg_backup_die "--verify-only requires a file path"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) pg_backup_die "unknown argument: $1" ;;
  esac
done

pg_backup_ensure_dirs

if [[ -n "${VERIFY_ONLY}" ]]; then
  pg_backup_log "verify-only: ${VERIFY_ONLY}"
  pg_backup_verify_artifact "${VERIFY_ONLY}"
  pg_backup_log "integrity OK"
  exit 0
fi

pg_backup_validate_config

if [[ "${DRY_RUN}" == "true" ]]; then
  pg_backup_log "DRY RUN — config OK"
  pg_backup_log "  database:     ${PG_BACKUP_DATABASE}@${PG_BACKUP_HOST}:${PG_BACKUP_PORT}"
  pg_backup_log "  archive dir:  ${PG_BACKUP_ARCHIVE_DIR}"
  pg_backup_log "  encryption:   $(pg_backup_encryption_enabled && echo yes || echo no)"
  pg_backup_log "  valid gens:   $(pg_backup_count_valid_archives)"
  exit 0
fi

pg_backup_check_disk

BASE_NAME="$(pg_backup_base_name)"
STAGING_DUMP="${PG_BACKUP_STAGING_DIR}/${BASE_NAME}.dump"
STAGING_FINAL=""

cleanup_staging() {
  rm -f "${STAGING_DUMP}" "${STAGING_FINAL}"
}
trap cleanup_staging EXIT

EXISTING_VALID="$(pg_backup_count_valid_archives)"
pg_backup_log "starting backup label=${PG_BACKUP_LABEL} base=${BASE_NAME} valid_generations=${EXISTING_VALID}"

pg_backup_create_dump "${STAGING_DUMP}"

if pg_backup_encryption_enabled; then
  STAGING_FINAL="${PG_BACKUP_STAGING_DIR}/${BASE_NAME}.dump.gpg"
  pg_backup_encrypt_file "${STAGING_DUMP}" "${STAGING_FINAL}"
  rm -f "${STAGING_DUMP}"
else
  STAGING_FINAL="${STAGING_DUMP}"
  STAGING_DUMP=""
fi

CHECKSUM="$(pg_backup_write_checksum_sidecar "${STAGING_FINAL}")"
if ! ARCHIVE_PATH="$(pg_backup_promote_artifact "${STAGING_FINAL}")"; then
  pg_backup_die "failed to promote artifact (refusing overwrite)"
fi
STAGING_FINAL=""

pg_backup_verify_artifact "${ARCHIVE_PATH}" || pg_backup_die "post-promote integrity check failed"

pg_backup_write_meta_json "${ARCHIVE_PATH}" "${CHECKSUM}"
pg_backup_write_last_success "${ARCHIVE_PATH}" "${CHECKSUM}"
pg_backup_rotate_local

if [[ -x "${SCRIPT_DIR}/vps-backup-status-textfile.sh" ]]; then
  bash "${SCRIPT_DIR}/vps-backup-status-textfile.sh" "$(date +%s)" || true
fi

pg_backup_log "backup SUCCESS: ${ARCHIVE_PATH}"
pg_backup_log "valid generations: $(pg_backup_count_valid_archives)"
