#!/usr/bin/env bash
# SynqDrive — PostgreSQL backup shared library (Phase 2C.2).

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
  PG_BACKUP_BACKEND_ENV="${PG_BACKUP_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

  PG_BACKUP_DATABASE="${PG_BACKUP_DATABASE:-synqdrive}"
  PG_BACKUP_USER="${PG_BACKUP_USER:-synqdrive}"
  PG_BACKUP_HOST="${PG_BACKUP_HOST:-127.0.0.1}"
  PG_BACKUP_PORT="${PG_BACKUP_PORT:-5432}"
  PG_BACKUP_PASSWORD="${PG_BACKUP_PASSWORD:-}"

  PG_BACKUP_LABEL="${PG_BACKUP_LABEL:-daily}"
  PG_BACKUP_MIN_GENERATIONS="${PG_BACKUP_MIN_GENERATIONS:-2}"
  PG_BACKUP_LOCAL_RETENTION_DAYS="${PG_BACKUP_LOCAL_RETENTION_DAYS:-14}"
  PG_BACKUP_DISK_WARN_PCT="${PG_BACKUP_DISK_WARN_PCT:-85}"
  PG_BACKUP_DISK_ABORT_PCT="${PG_BACKUP_DISK_ABORT_PCT:-90}"
  PG_BACKUP_MIN_BYTES="${PG_BACKUP_MIN_BYTES:-4096}"
  PG_BACKUP_SKIP_ROTATION="${PG_BACKUP_SKIP_ROTATION:-false}"
  PG_BACKUP_ALLOW_UNENCRYPTED="${PG_BACKUP_ALLOW_UNENCRYPTED:-false}"

  PG_BACKUP_GPG_RECIPIENT="${PG_BACKUP_GPG_RECIPIENT:-}"
  PG_BACKUP_GPG_RECIPIENT_FINGERPRINT="${PG_BACKUP_GPG_RECIPIENT_FINGERPRINT:-}"
  PG_BACKUP_GPG_PASSPHRASE_FILE="${PG_BACKUP_GPG_PASSPHRASE_FILE:-}"
}

pg_backup_log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

pg_backup_die() {
  pg_backup_log "ERROR: $*"
  exit 1
}

pg_backup_load_env_file() {
  if [[ -f "${PG_BACKUP_ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${PG_BACKUP_ENV_FILE}"
    set +a
  fi
}

pg_backup_load_backend_credentials() {
  if [[ -n "${PG_BACKUP_PASSWORD}" ]]; then
    return 0
  fi
  if [[ ! -f "${PG_BACKUP_BACKEND_ENV}" ]]; then
    return 0
  fi
  local line key val
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ "${line}" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    case "${key}" in
      DATABASE_URL)
        if [[ "${val}" =~ postgresql://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/([^?]+) ]]; then
          PG_BACKUP_USER="${BASH_REMATCH[1]}"
          PG_BACKUP_PASSWORD="${BASH_REMATCH[2]}"
          PG_BACKUP_HOST="${BASH_REMATCH[3]}"
          PG_BACKUP_PORT="${BASH_REMATCH[4]:-5432}"
          PG_BACKUP_DATABASE="${BASH_REMATCH[5]}"
        fi
        ;;
    esac
  done < "${PG_BACKUP_BACKEND_ENV}"
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

pg_backup_bind_gpg_context() {
  # shellcheck source=lib/gpg-backup-lib.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/gpg-backup-lib.sh"
  gpg_backup_resolve_context \
    PG_BACKUP_GPG_RECIPIENT_FINGERPRINT \
    PG_BACKUP_GPG_RECIPIENT \
    PG_BACKUP_GPG_PASSPHRASE_FILE
}

pg_backup_encryption_enabled() {
  pg_backup_bind_gpg_context
  gpg_backup_encryption_enabled \
    "${PG_BACKUP_GPG_RECIPIENT_FINGERPRINT}" \
    "${PG_BACKUP_GPG_RECIPIENT}" \
    "${PG_BACKUP_GPG_PASSPHRASE_FILE}"
}

pg_backup_validate_config() {
  if ! command -v pg_dump >/dev/null 2>&1; then
    pg_backup_die "pg_dump not found"
  fi
  if [[ -z "${PG_BACKUP_PASSWORD}" && -z "${PG_BACKUP_USER}" ]]; then
    pg_backup_die "PostgreSQL credentials not configured"
  fi
  if ! pg_backup_encryption_enabled; then
    if [[ "${PG_BACKUP_ALLOW_UNENCRYPTED}" != "true" ]]; then
      pg_backup_die "encryption required — set PG_BACKUP_GPG_RECIPIENT_FINGERPRINT or PG_BACKUP_GPG_PASSPHRASE_FILE"
    fi
    pg_backup_log "WARN: unencrypted archives allowed (dev only)"
  else
    pg_backup_bind_gpg_context
    if [[ -z "${PG_BACKUP_GPG_PASSPHRASE_FILE}" || ! -f "${PG_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
      gpg_backup_verify_recipient_keyring \
        "${PG_BACKUP_GPG_RECIPIENT_FINGERPRINT}" \
        "${PG_BACKUP_GPG_RECIPIENT}"
    fi
  fi
}

pg_backup_base_name() {
  printf 'synqdrive-%s-%s' "${PG_BACKUP_LABEL}" "$(date -u +%Y%m%dT%H%M%SZ)"
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
  chmod 600 "${artifact}.sha256" 2>/dev/null || true
  printf '%s' "${checksum}"
}

pg_backup_verify_checksum_sidecar() {
  local artifact="$1"
  local sidecar="${artifact}.sha256"
  [[ -f "${sidecar}" ]] || return 1
  local dir base
  dir="$(dirname "${artifact}")"
  base="$(basename "${sidecar}")"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "${dir}" && sha256sum -c "${base}") >/dev/null 2>&1
  else
    (cd "${dir}" && shasum -a 256 -c "${base}") >/dev/null 2>&1
  fi
}

pg_backup_verify_dump() {
  local dump_path="$1"
  if [[ "${dump_path}" == *.dump ]]; then
    PGPASSWORD="${PG_BACKUP_PASSWORD}" pg_restore --list "${dump_path}" >/dev/null 2>&1
    return $?
  fi
  [[ -s "${dump_path}" ]]
}

pg_backup_verify_artifact() {
  local artifact="$1"
  local verify_dump="${artifact}"
  local temp_dump=""

  if [[ ! -s "${artifact}" ]]; then
    pg_backup_log "verify fail: empty ${artifact}"
    return 1
  fi
  if [[ "$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")" -lt "${PG_BACKUP_MIN_BYTES}" ]]; then
    pg_backup_log "verify fail: too small ${artifact}"
    return 1
  fi
  if ! pg_backup_verify_checksum_sidecar "${artifact}"; then
    pg_backup_log "verify fail: checksum ${artifact}"
    return 1
  fi

  if [[ "${artifact}" == *.gpg ]]; then
    pg_backup_bind_gpg_context
    if gpg_backup_has_secret_key \
      "${PG_BACKUP_GPG_RECIPIENT_FINGERPRINT}" \
      "${PG_BACKUP_GPG_RECIPIENT}" \
      "${PG_BACKUP_GPG_PASSPHRASE_FILE}"; then
      temp_dump="$(mktemp "${PG_BACKUP_STAGING_DIR}/verify.XXXXXX.dump")"
      gpg_backup_decrypt_file \
        "${artifact}" "${temp_dump}" \
        "${PG_BACKUP_GPG_RECIPIENT_FINGERPRINT}" \
        "${PG_BACKUP_GPG_RECIPIENT}" \
        "${PG_BACKUP_GPG_PASSPHRASE_FILE}" || {
        [[ -n "${temp_dump}" ]] && rm -f "${temp_dump}"
        pg_backup_log "verify fail: decrypt ${artifact}"
        return 1
      }
      verify_dump="${temp_dump}"
    elif ! gpg_backup_verify_encrypted_packets \
      "${artifact}" \
      "${PG_BACKUP_GPG_RECIPIENT_FINGERPRINT}" \
      "${PG_BACKUP_GPG_RECIPIENT}"; then
      pg_backup_log "verify fail: gpg packet check ${artifact}"
      return 1
    else
      return 0
    fi
  fi

  if [[ "${verify_dump}" == *.dump ]]; then
    pg_backup_verify_dump "${verify_dump}" || {
      [[ -n "${temp_dump}" ]] && rm -f "${temp_dump}"
      pg_backup_log "verify fail: pg_restore --list ${verify_dump}"
      return 1
    }
  fi
  [[ -n "${temp_dump}" ]] && rm -f "${temp_dump}"
  return 0
}

pg_backup_list_valid_archives() {
  local dir="$1"
  local f
  for f in "${dir}"/synqdrive-*.dump "${dir}"/synqdrive-*.dump.gpg; do
    [[ -f "${f}" ]] || continue
    if pg_backup_verify_artifact "${f}" >&2; then
      printf '%s\n' "${f}"
    fi
  done | sort
}

pg_backup_count_valid_archives() {
  pg_backup_list_valid_archives "${PG_BACKUP_ARCHIVE_DIR}" | wc -l | tr -d ' '
}

pg_backup_encrypt_file() {
  local plain="$1"
  local encrypted="$2"
  pg_backup_bind_gpg_context
  gpg_backup_encrypt_file \
    "${plain}" "${encrypted}" \
    "${PG_BACKUP_GPG_RECIPIENT_FINGERPRINT}" \
    "${PG_BACKUP_GPG_RECIPIENT}" \
    "${PG_BACKUP_GPG_PASSPHRASE_FILE}"
}

pg_backup_promote_artifact() {
  local staging_final="$1"
  local archive_path="${PG_BACKUP_ARCHIVE_DIR}/$(basename "${staging_final}")"
  if [[ -e "${archive_path}" ]]; then
    pg_backup_log "refusing to overwrite existing archive ${archive_path}"
    return 1
  fi
  mv "${staging_final}" "${archive_path}"
  if [[ -f "${staging_final}.sha256" ]]; then
    mv "${staging_final}.sha256" "${archive_path}.sha256"
  fi
  chmod 600 "${archive_path}" 2>/dev/null || true
  printf '%s' "${archive_path}"
}

pg_backup_create_dump() {
  local target_path="$1"
  pg_backup_log "creating pg_dump custom format for ${PG_BACKUP_DATABASE}"
  PGPASSWORD="${PG_BACKUP_PASSWORD}" pg_dump \
    -h "${PG_BACKUP_HOST}" \
    -p "${PG_BACKUP_PORT}" \
    -U "${PG_BACKUP_USER}" \
    -d "${PG_BACKUP_DATABASE}" \
    -Fc \
    -f "${target_path}"
  pg_backup_verify_dump "${target_path}"
}

pg_backup_write_meta_json() {
  local artifact="$1"
  local checksum="$2"
  local meta="${artifact}.meta.json"
  local size encrypted="false" host
  size="$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")"
  host="$(hostname -f 2>/dev/null || hostname)"
  if [[ "${artifact}" == *.gpg ]]; then
    encrypted="true"
  fi
  cat > "${meta}" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "label": "${PG_BACKUP_LABEL}",
  "database": "${PG_BACKUP_DATABASE}",
  "format": "postgresql-custom-dump",
  "encrypted": ${encrypted},
  "size_bytes": ${size},
  "sha256": "${checksum}",
  "integrity_verified_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": $(python3 -c "import json; print(json.dumps('${host}'))")
}
EOF
  chmod 600 "${meta}" 2>/dev/null || true
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

pg_backup_rotate_local() {
  local valid_count min_keep deleted=0
  if [[ "${PG_BACKUP_SKIP_ROTATION}" == "true" ]]; then
    return 0
  fi
  valid_count="$(pg_backup_count_valid_archives)"
  min_keep="${PG_BACKUP_MIN_GENERATIONS}"
  if [[ "${valid_count}" -le "${min_keep}" ]]; then
    pg_backup_log "rotation: ${valid_count} valid — keeping all (min ${min_keep})"
    return 0
  fi
  local f age_days
  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    valid_count="$(pg_backup_count_valid_archives)"
    [[ "${valid_count}" -le "${min_keep}" ]] && break
    age_days=$(( ( $(date +%s) - $(stat -c%Y "${f}" 2>/dev/null || stat -f%m "${f}") ) / 86400 ))
    [[ "${age_days}" -lt "${PG_BACKUP_LOCAL_RETENTION_DAYS}" ]] && continue
    pg_backup_log "rotation: removing ${f} (age ${age_days}d)"
    rm -f "${f}" "${f}.sha256" "${f}.meta.json"
    deleted=$((deleted + 1))
    valid_count="$(pg_backup_count_valid_archives)"
    [[ "${valid_count}" -lt "${min_keep}" ]] && pg_backup_die "rotation safety: below ${min_keep} generations"
  done < <(pg_backup_list_valid_archives "${PG_BACKUP_ARCHIVE_DIR}")
  pg_backup_log "rotation: removed ${deleted}; $(pg_backup_count_valid_archives) valid remain"
}
