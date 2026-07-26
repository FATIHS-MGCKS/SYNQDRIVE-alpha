#!/usr/bin/env bash
# SynqDrive — PostgreSQL backup shared library (sourced, not executed directly).
# Phase 2C.2 — production backup pipeline with integrity, rotation, encryption, offsite.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# shellcheck disable=SC2034
PG_BACKUP_LIB_VERSION="2c2.1"

pg_backup_defaults() {
  PG_BACKUP_ROOT="${PG_BACKUP_ROOT:-/opt/synqdrive/shared/backups/postgresql}"
  PG_BACKUP_STAGING_DIR="${PG_BACKUP_STAGING_DIR:-${PG_BACKUP_ROOT}/staging}"
  PG_BACKUP_ARCHIVE_DIR="${PG_BACKUP_ARCHIVE_DIR:-${PG_BACKUP_ROOT}/daily}"
  PG_BACKUP_STATE_DIR="${PG_BACKUP_STATE_DIR:-${PG_BACKUP_ROOT}/state}"
  PG_BACKUP_MANIFEST="${PG_BACKUP_MANIFEST:-${PG_BACKUP_ROOT}/manifest.jsonl}"
  PG_BACKUP_ENV_FILE="${PG_BACKUP_ENV_FILE:-/opt/synqdrive/shared/postgresql-backup.env}"

  PG_BACKUP_DB_NAME="${PG_BACKUP_DB_NAME:-synqdrive}"
  PG_BACKUP_PG_USER="${PG_BACKUP_PG_USER:-postgres}"
  PG_BACKUP_LABEL="${PG_BACKUP_LABEL:-daily}"

  PG_BACKUP_MIN_GENERATIONS="${PG_BACKUP_MIN_GENERATIONS:-2}"
  PG_BACKUP_LOCAL_RETENTION_DAYS="${PG_BACKUP_LOCAL_RETENTION_DAYS:-30}"
  PG_BACKUP_OFFSITE_RETENTION_DAYS="${PG_BACKUP_OFFSITE_RETENTION_DAYS:-90}"

  PG_BACKUP_DISK_WARN_PCT="${PG_BACKUP_DISK_WARN_PCT:-85}"
  PG_BACKUP_DISK_ABORT_PCT="${PG_BACKUP_DISK_ABORT_PCT:-90}"
  PG_BACKUP_MIN_BYTES="${PG_BACKUP_MIN_BYTES:-1048576}"

  PG_BACKUP_SKIP_ROTATION="${PG_BACKUP_SKIP_ROTATION:-false}"
  PG_BACKUP_SKIP_OFFSITE="${PG_BACKUP_SKIP_OFFSITE:-false}"
  PG_BACKUP_ALLOW_UNENCRYPTED="${PG_BACKUP_ALLOW_UNENCRYPTED:-false}"

  PG_BACKUP_OFFSITE_MODE="${PG_BACKUP_OFFSITE_MODE:-none}"
  PG_BACKUP_RCLONE_REMOTE="${PG_BACKUP_RCLONE_REMOTE:-}"
  PG_BACKUP_S3_URI="${PG_BACKUP_S3_URI:-}"

  PG_BACKUP_GPG_RECIPIENT="${PG_BACKUP_GPG_RECIPIENT:-}"
  PG_BACKUP_GPG_PASSPHRASE_FILE="${PG_BACKUP_GPG_PASSPHRASE_FILE:-}"
}

pg_backup_load_env_file() {
  if [[ -f "${PG_BACKUP_ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${PG_BACKUP_ENV_FILE}"
    set +a
  fi
}

pg_backup_log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

pg_backup_die() {
  pg_backup_log "ERROR: $*"
  exit 1
}

pg_backup_ensure_dirs() {
  mkdir -p "${PG_BACKUP_STAGING_DIR}" "${PG_BACKUP_ARCHIVE_DIR}" "${PG_BACKUP_STATE_DIR}"
  chmod 700 "${PG_BACKUP_ROOT}" "${PG_BACKUP_STAGING_DIR}" "${PG_BACKUP_STATE_DIR}" 2>/dev/null || true
}

pg_backup_check_disk() {
  local disk_use_pct
  disk_use_pct="$(df "${PG_BACKUP_ROOT}" | tail -1 | awk '{print $5}' | tr -d '%')"
  if [[ "${disk_use_pct}" -ge "${PG_BACKUP_DISK_ABORT_PCT}" ]]; then
    pg_backup_die "filesystem ${disk_use_pct}% full (abort >= ${PG_BACKUP_DISK_ABORT_PCT}%)"
  fi
  if [[ "${disk_use_pct}" -ge "${PG_BACKUP_DISK_WARN_PCT}" ]]; then
    pg_backup_log "WARN: filesystem ${disk_use_pct}% full"
  fi
}

pg_backup_run_as_postgres() {
  if [[ "$(id -un)" == "${PG_BACKUP_PG_USER}" ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "${PG_BACKUP_PG_USER}" "$@"
  else
    pg_backup_die "must run as ${PG_BACKUP_PG_USER} or with sudo"
  fi
}

pg_backup_encryption_enabled() {
  [[ -n "${PG_BACKUP_GPG_RECIPIENT}" || -f "${PG_BACKUP_GPG_PASSPHRASE_FILE}" ]]
}

pg_backup_validate_config() {
  if ! command -v pg_dump >/dev/null 2>&1; then
    pg_backup_die "pg_dump not found"
  fi
  if ! command -v pg_restore >/dev/null 2>&1; then
    pg_backup_die "pg_restore not found"
  fi
  if ! pg_backup_encryption_enabled; then
    if [[ "${PG_BACKUP_ALLOW_UNENCRYPTED}" != "true" ]]; then
      pg_backup_die "encryption required — set PG_BACKUP_GPG_RECIPIENT or PG_BACKUP_GPG_PASSPHRASE_FILE (or PG_BACKUP_ALLOW_UNENCRYPTED=true for dev)"
    fi
    pg_backup_log "WARN: unencrypted backups allowed (dev only)"
  fi
  case "${PG_BACKUP_OFFSITE_MODE}" in
    none) ;;
    rclone)
      if [[ "${PG_BACKUP_SKIP_OFFSITE}" != "true" && -z "${PG_BACKUP_RCLONE_REMOTE}" ]]; then
        pg_backup_die "PG_BACKUP_OFFSITE_MODE=rclone requires PG_BACKUP_RCLONE_REMOTE"
      fi
      ;;
    s3)
      if [[ "${PG_BACKUP_SKIP_OFFSITE}" != "true" && -z "${PG_BACKUP_S3_URI}" ]]; then
        pg_backup_die "PG_BACKUP_OFFSITE_MODE=s3 requires PG_BACKUP_S3_URI"
      fi
      ;;
    *)
      pg_backup_die "invalid PG_BACKUP_OFFSITE_MODE=${PG_BACKUP_OFFSITE_MODE}"
      ;;
  esac
}

pg_backup_base_name() {
  local ts label
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  label="${PG_BACKUP_LABEL}"
  printf 'synqdrive-%s-%s' "${label}" "${ts}"
}

pg_backup_verify_custom_dump() {
  local dump_path="$1"
  pg_backup_run_as_postgres pg_restore --list "${dump_path}" >/dev/null
}

pg_backup_sha256_file() {
  local target="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${target}" | awk '{print $1}'
  else
    shasum -a 256 "${target}" | awk '{print $1}'
  fi
}

pg_backup_write_checksum_sidecar() {
  local artifact="$1"
  local checksum
  checksum="$(pg_backup_sha256_file "${artifact}")"
  printf '%s  %s\n' "${checksum}" "$(basename "${artifact}")" > "${artifact}.sha256"
  printf '%s' "${checksum}"
}

pg_backup_verify_checksum_sidecar() {
  local artifact="$1"
  local sidecar="${artifact}.sha256"
  [[ -f "${sidecar}" ]] || return 1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "${sidecar}" >/dev/null 2>&1
  else
    shasum -a 256 -c "${sidecar}" >/dev/null 2>&1
  fi
}

pg_backup_decrypt_to_temp() {
  local encrypted_path="$1"
  local temp_dump
  temp_dump="$(mktemp "${PG_BACKUP_STAGING_DIR}/verify.XXXXXX.dump")"
  if [[ -n "${PG_BACKUP_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --decrypt --output "${temp_dump}" "${encrypted_path}"
  elif [[ -f "${PG_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --passphrase-file "${PG_BACKUP_GPG_PASSPHRASE_FILE}" \
      --decrypt --output "${temp_dump}" "${encrypted_path}"
  else
    cp "${encrypted_path}" "${temp_dump}"
  fi
  printf '%s' "${temp_dump}"
}

pg_backup_verify_artifact() {
  local artifact="$1"
  local temp_dump="" decrypted=""

  if [[ ! -s "${artifact}" ]]; then
    pg_backup_log "verify fail: empty artifact ${artifact}"
    return 1
  fi
  if [[ "$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")" -lt "${PG_BACKUP_MIN_BYTES}" ]]; then
    pg_backup_log "verify fail: artifact too small ${artifact}"
    return 1
  fi
  if ! pg_backup_verify_checksum_sidecar "${artifact}"; then
    pg_backup_log "verify fail: checksum mismatch ${artifact}"
    return 1
  fi

  case "${artifact}" in
    *.dump.gpg)
      decrypted="$(pg_backup_decrypt_to_temp "${artifact}")"
      temp_dump="${decrypted}"
      pg_backup_verify_custom_dump "${temp_dump}"
      rm -f "${temp_dump}"
      ;;
    *.dump)
      pg_backup_verify_custom_dump "${artifact}"
      ;;
  esac
  return 0
}

pg_backup_list_valid_archives() {
  local dir="$1"
  local f
  for f in "${dir}"/synqdrive-*.dump "${dir}"/synqdrive-*.dump.gpg; do
    [[ -f "${f}" ]] || continue
    if pg_backup_verify_artifact "${f}"; then
      printf '%s\n' "${f}"
    fi
  done | sort
}

pg_backup_count_valid_archives() {
  pg_backup_list_valid_archives "${PG_BACKUP_ARCHIVE_DIR}" | wc -l | tr -d ' '
}

pg_backup_write_meta_json() {
  local artifact="$1"
  local checksum="$2"
  local meta="${artifact}.meta.json"
  local size encrypted="false" pg_ver host
  size="$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")"
  pg_ver="$(pg_dump --version | head -1)"
  host="$(hostname -f 2>/dev/null || hostname)"
  if [[ "${artifact}" == *.gpg ]]; then
    encrypted="true"
  fi
  cat > "${meta}" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "label": "${PG_BACKUP_LABEL}",
  "database": "${PG_BACKUP_DB_NAME}",
  "format": "custom",
  "encrypted": ${encrypted},
  "size_bytes": ${size},
  "sha256": "${checksum}",
  "integrity_verified_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pg_dump_version": $(python3 -c "import json; print(json.dumps('${pg_ver}'))"),
  "hostname": $(python3 -c "import json; print(json.dumps('${host}'))")
}
EOF
  chmod 600 "${meta}" 2>/dev/null || true
}

pg_backup_append_manifest() {
  local artifact="$1"
  local checksum="$2"
  local meta="${artifact}.meta.json"
  if [[ -f "${meta}" ]]; then
    printf '%s\n' "$(tr -d '\n' < "${meta}")" >> "${PG_BACKUP_MANIFEST}"
  else
    printf '{"artifact":"%s","sha256":"%s","timestamp":"%s"}\n' \
      "${artifact}" "${checksum}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${PG_BACKUP_MANIFEST}"
  fi
}

pg_backup_write_last_success() {
  local artifact="$1"
  local checksum="$2"
  cat > "${PG_BACKUP_STATE_DIR}/last-success.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "artifact": "${artifact}",
  "sha256": "${checksum}",
  "label": "${PG_BACKUP_LABEL}"
}
EOF
  chmod 600 "${PG_BACKUP_STATE_DIR}/last-success.json" 2>/dev/null || true
}

pg_backup_encrypt_file() {
  local plain="$1"
  local encrypted="$2"
  if [[ -n "${PG_BACKUP_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --trust-model always \
      --encrypt --recipient "${PG_BACKUP_GPG_RECIPIENT}" \
      --output "${encrypted}" "${plain}"
  elif [[ -f "${PG_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-file "${PG_BACKUP_GPG_PASSPHRASE_FILE}" \
      --output "${encrypted}" "${plain}"
  else
    cp "${plain}" "${encrypted}"
  fi
}

pg_backup_create_dump() {
  local staging_plain="$1"
  pg_backup_log "creating consistent pg_dump (custom format, MVCC snapshot)"
  pg_backup_run_as_postgres pg_dump \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="${staging_plain}" \
    "${PG_BACKUP_DB_NAME}"
  pg_backup_verify_custom_dump "${staging_plain}"
}

pg_backup_promote_artifact() {
  local staging_final="$1"
  local archive_path="${PG_BACKUP_ARCHIVE_DIR}/$(basename "${staging_final}")"
  if [[ -e "${archive_path}" ]]; then
    pg_backup_log "refusing to overwrite existing archive ${archive_path}"
    return 1
  fi
  mv "${staging_final}" "${archive_path}"
  printf '%s' "${archive_path}"
}

pg_backup_copy_offsite() {
  local artifact="$1"
  if [[ "${PG_BACKUP_SKIP_OFFSITE}" == "true" || "${PG_BACKUP_OFFSITE_MODE}" == "none" ]]; then
    pg_backup_log "offsite copy skipped"
    return 0
  fi
  case "${PG_BACKUP_OFFSITE_MODE}" in
    rclone)
      pg_backup_log "offsite: rclone copy to ${PG_BACKUP_RCLONE_REMOTE}"
      rclone copy "${artifact}" "${PG_BACKUP_RCLONE_REMOTE}/" \
        --checksum \
        --immutable
      rclone copy "${artifact}.sha256" "${PG_BACKUP_RCLONE_REMOTE}/" --immutable
      rclone copy "${artifact}.meta.json" "${PG_BACKUP_RCLONE_REMOTE}/" --immutable
      ;;
    s3)
      pg_backup_log "offsite: aws s3 cp to ${PG_BACKUP_S3_URI}"
      aws s3 cp "${artifact}" "${PG_BACKUP_S3_URI}/$(basename "${artifact}")" --only-show-errors
      aws s3 cp "${artifact}.sha256" "${PG_BACKUP_S3_URI}/$(basename "${artifact}").sha256" --only-show-errors
      aws s3 cp "${artifact}.meta.json" "${PG_BACKUP_S3_URI}/$(basename "${artifact}").meta.json" --only-show-errors
      ;;
  esac
}

pg_backup_rotate_local() {
  local valid_count min_keep deleted=0
  if [[ "${PG_BACKUP_SKIP_ROTATION}" == "true" ]]; then
    pg_backup_log "rotation skipped"
    return 0
  fi

  valid_count="$(pg_backup_count_valid_archives)"
  min_keep="${PG_BACKUP_MIN_GENERATIONS}"
  if [[ "${valid_count}" -le "${min_keep}" ]]; then
    pg_backup_log "rotation: ${valid_count} valid generation(s) — keeping all (min ${min_keep})"
    return 0
  fi

  local f age_days
  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    valid_count="$(pg_backup_count_valid_archives)"
    if [[ "${valid_count}" -le "${min_keep}" ]]; then
      break
    fi
    age_days=$(( ( $(date +%s) - $(stat -c%Y "${f}" 2>/dev/null || stat -f%m "${f}") ) / 86400 ))
    if [[ "${age_days}" -lt "${PG_BACKUP_LOCAL_RETENTION_DAYS}" ]]; then
      continue
    fi
    pg_backup_log "rotation: removing expired ${f} (age ${age_days}d)"
    rm -f "${f}" "${f}.sha256" "${f}.meta.json"
    deleted=$((deleted + 1))
    valid_count="$(pg_backup_count_valid_archives)"
    if [[ "${valid_count}" -lt "${min_keep}" ]]; then
      pg_backup_die "rotation safety: valid generations dropped below ${min_keep}"
    fi
  done < <(pg_backup_list_valid_archives "${PG_BACKUP_ARCHIVE_DIR}")

  pg_backup_log "rotation complete: removed ${deleted} expired archive(s); $(pg_backup_count_valid_archives) valid remain"
}

pg_backup_cleanup_staging() {
  find "${PG_BACKUP_STAGING_DIR}" -mindepth 1 -maxdepth 1 -mprintf '%T@ %p\n' 2>/dev/null \
    | sort -n | head -n -5 | cut -d' ' -f2- | xargs -r rm -f 2>/dev/null || true
  find "${PG_BACKUP_STAGING_DIR}" -mindepth 1 -maxdepth 1 -type f -mtime +1 -delete 2>/dev/null || true
}
