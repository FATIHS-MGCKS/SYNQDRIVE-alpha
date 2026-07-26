#!/usr/bin/env bash
# SynqDrive — ClickHouse backup shared library (sourced, not executed directly).
# Phase 2C.3 — logical backup via existing Disk('backups') mount; no container/volume changes.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# shellcheck disable=SC2034
CH_BACKUP_LIB_VERSION="2c3.1"

ch_backup_defaults() {
  CH_BACKUP_ROOT="${CH_BACKUP_ROOT:-/opt/synqdrive/shared/backups/clickhouse}"
  CH_BACKUP_STAGING_DIR="${CH_BACKUP_STAGING_DIR:-${CH_BACKUP_ROOT}/staging}"
  CH_BACKUP_ARCHIVE_DIR="${CH_BACKUP_ARCHIVE_DIR:-${CH_BACKUP_ROOT}/daily}"
  CH_BACKUP_STATE_DIR="${CH_BACKUP_STATE_DIR:-${CH_BACKUP_ROOT}/state}"
  CH_BACKUP_MANIFEST="${CH_BACKUP_MANIFEST:-${CH_BACKUP_ROOT}/manifest.jsonl}"
  CH_BACKUP_ENV_FILE="${CH_BACKUP_ENV_FILE:-/opt/synqdrive/shared/clickhouse-backup.env}"
  CH_BACKUP_BACKEND_ENV="${CH_BACKUP_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

  CH_BACKUP_CONTAINER="${CH_BACKUP_CONTAINER:-synqdrive-clickhouse}"
  CH_BACKUP_DATABASE="${CH_BACKUP_DATABASE:-synqdrive}"
  CH_BACKUP_USER="${CH_BACKUP_USER:-synqdrive}"
  CH_BACKUP_PASSWORD="${CH_BACKUP_PASSWORD:-}"

  CH_BACKUP_LABEL="${CH_BACKUP_LABEL:-daily}"
  CH_BACKUP_DISK_NAME="${CH_BACKUP_DISK_NAME:-backups}"

  CH_BACKUP_MIN_GENERATIONS="${CH_BACKUP_MIN_GENERATIONS:-2}"
  CH_BACKUP_LOCAL_RETENTION_DAYS="${CH_BACKUP_LOCAL_RETENTION_DAYS:-14}"
  CH_BACKUP_OFFSITE_RETENTION_DAYS="${CH_BACKUP_OFFSITE_RETENTION_DAYS:-30}"

  CH_BACKUP_DISK_WARN_PCT="${CH_BACKUP_DISK_WARN_PCT:-85}"
  CH_BACKUP_DISK_ABORT_PCT="${CH_BACKUP_DISK_ABORT_PCT:-90}"
  CH_BACKUP_MIN_BYTES="${CH_BACKUP_MIN_BYTES:-4096}"

  CH_BACKUP_SKIP_ROTATION="${CH_BACKUP_SKIP_ROTATION:-false}"
  CH_BACKUP_SKIP_OFFSITE="${CH_BACKUP_SKIP_OFFSITE:-false}"
  CH_BACKUP_SKIP_CONTAINER_MOUNT_CLEANUP="${CH_BACKUP_SKIP_CONTAINER_MOUNT_CLEANUP:-false}"
  CH_BACKUP_ALLOW_UNENCRYPTED="${CH_BACKUP_ALLOW_UNENCRYPTED:-false}"

  CH_BACKUP_OFFSITE_MODE="${CH_BACKUP_OFFSITE_MODE:-none}"
  CH_BACKUP_RCLONE_REMOTE="${CH_BACKUP_RCLONE_REMOTE:-}"
  CH_BACKUP_S3_URI="${CH_BACKUP_S3_URI:-}"

  CH_BACKUP_GPG_RECIPIENT="${CH_BACKUP_GPG_RECIPIENT:-}"
  CH_BACKUP_GPG_PASSPHRASE_FILE="${CH_BACKUP_GPG_PASSPHRASE_FILE:-}"

  CH_BACKUP_RESTORE_TEST_DB="${CH_BACKUP_RESTORE_TEST_DB:-synqdrive_restore_test}"
}

ch_backup_log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

ch_backup_die() {
  ch_backup_log "ERROR: $*"
  exit 1
}

ch_backup_load_env_file() {
  if [[ -f "${CH_BACKUP_ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${CH_BACKUP_ENV_FILE}"
    set +a
  fi
}

ch_backup_load_backend_credentials() {
  if [[ -n "${CH_BACKUP_PASSWORD}" ]]; then
    return 0
  fi
  if [[ ! -f "${CH_BACKUP_BACKEND_ENV}" ]]; then
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
      CLICKHOUSE_DATABASE) CH_BACKUP_DATABASE="${val}" ;;
      CLICKHOUSE_USER) CH_BACKUP_USER="${val}" ;;
      CLICKHOUSE_PASSWORD) CH_BACKUP_PASSWORD="${val}" ;;
    esac
  done < "${CH_BACKUP_BACKEND_ENV}"
}

ch_backup_ensure_dirs() {
  mkdir -p "${CH_BACKUP_STAGING_DIR}" "${CH_BACKUP_ARCHIVE_DIR}" "${CH_BACKUP_STATE_DIR}"
  chmod 700 "${CH_BACKUP_ROOT}" "${CH_BACKUP_STAGING_DIR}" "${CH_BACKUP_STATE_DIR}" 2>/dev/null || true
}

ch_backup_check_disk() {
  local disk_use_pct
  disk_use_pct="$(df "${CH_BACKUP_ROOT}" | tail -1 | awk '{print $5}' | tr -d '%')"
  if [[ "${disk_use_pct}" -ge "${CH_BACKUP_DISK_ABORT_PCT}" ]]; then
    ch_backup_die "filesystem ${disk_use_pct}% full (abort >= ${CH_BACKUP_DISK_ABORT_PCT}%)"
  fi
  if [[ "${disk_use_pct}" -ge "${CH_BACKUP_DISK_WARN_PCT}" ]]; then
    ch_backup_log "WARN: filesystem ${disk_use_pct}% full"
  fi
}

ch_backup_encryption_enabled() {
  [[ -n "${CH_BACKUP_GPG_RECIPIENT}" || -f "${CH_BACKUP_GPG_PASSPHRASE_FILE}" ]]
}

ch_backup_validate_config() {
  if ! command -v docker >/dev/null 2>&1; then
    ch_backup_die "docker not found"
  fi
  if ! docker inspect "${CH_BACKUP_CONTAINER}" >/dev/null 2>&1; then
    ch_backup_die "container not running: ${CH_BACKUP_CONTAINER}"
  fi
  if [[ -z "${CH_BACKUP_PASSWORD}" ]]; then
    ch_backup_die "CLICKHOUSE_PASSWORD not set (clickhouse-backup.env or backend.env)"
  fi
  if ! ch_backup_encryption_enabled; then
    if [[ "${CH_BACKUP_ALLOW_UNENCRYPTED}" != "true" ]]; then
      ch_backup_die "encryption required — set CH_BACKUP_GPG_RECIPIENT or CH_BACKUP_GPG_PASSPHRASE_FILE"
    fi
    ch_backup_log "WARN: unencrypted archives allowed (dev only)"
  fi
  case "${CH_BACKUP_OFFSITE_MODE}" in
    none) ;;
    rclone)
      if [[ "${CH_BACKUP_SKIP_OFFSITE}" != "true" && -z "${CH_BACKUP_RCLONE_REMOTE}" ]]; then
        ch_backup_die "CH_BACKUP_OFFSITE_MODE=rclone requires CH_BACKUP_RCLONE_REMOTE"
      fi
      ;;
    s3)
      if [[ "${CH_BACKUP_SKIP_OFFSITE}" != "true" && -z "${CH_BACKUP_S3_URI}" ]]; then
        ch_backup_die "CH_BACKUP_OFFSITE_MODE=s3 requires CH_BACKUP_S3_URI"
      fi
      ;;
    *)
      ch_backup_die "invalid CH_BACKUP_OFFSITE_MODE=${CH_BACKUP_OFFSITE_MODE}"
      ;;
  esac
}

ch_backup_container_mount_path() {
  local mount
  mount="$(docker inspect "${CH_BACKUP_CONTAINER}" --format '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
  if [[ -z "${mount}" ]]; then
    mount="${CH_BACKUP_CONTAINER_MOUNT_FALLBACK:-/opt/synqdrive/current/backend/storage/clickhouse/backups}"
    ch_backup_log "WARN: could not detect /backups mount — using fallback ${mount}"
  fi
  printf '%s' "${mount}"
}

ch_backup_client_query() {
  docker exec "${CH_BACKUP_CONTAINER}" clickhouse-client \
    --user "${CH_BACKUP_USER}" \
    --password "${CH_BACKUP_PASSWORD}" \
    --query "$1"
}

ch_backup_base_name() {
  printf 'synqdrive-%s-%s' "${CH_BACKUP_LABEL}" "$(date -u +%Y%m%dT%H%M%SZ)"
}

ch_backup_zip_name() {
  printf '%s.zip' "$(ch_backup_base_name)"
}

ch_backup_sha256_file() {
  local target="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${target}" | awk '{print $1}'
  else
    shasum -a 256 "${target}" | awk '{print $1}'
  fi
}

ch_backup_write_checksum_sidecar() {
  local artifact="$1"
  local checksum
  checksum="$(ch_backup_sha256_file "${artifact}")"
  printf '%s  %s\n' "${checksum}" "$(basename "${artifact}")" > "${artifact}.sha256"
  printf '%s' "${checksum}"
}

ch_backup_verify_checksum_sidecar() {
  local artifact="$1"
  local sidecar="${artifact}.sha256"
  [[ -f "${sidecar}" ]] || return 1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "${sidecar}" >/dev/null 2>&1
  else
    shasum -a 256 -c "${sidecar}" >/dev/null 2>&1
  fi
}

ch_backup_verify_zip_integrity() {
  local zip_path="$1"
  if ! command -v unzip >/dev/null 2>&1; then
    ch_backup_log "WARN: unzip not installed — skipping zip test"
    return 0
  fi
  unzip -t "${zip_path}" >/dev/null
}

ch_backup_verify_artifact() {
  local artifact="$1"
  local verify_zip="${artifact}"
  local temp_zip=""

  if [[ ! -s "${artifact}" ]]; then
    ch_backup_log "verify fail: empty ${artifact}"
    return 1
  fi
  if [[ "$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")" -lt "${CH_BACKUP_MIN_BYTES}" ]]; then
    ch_backup_log "verify fail: too small ${artifact}"
    return 1
  fi
  if ! ch_backup_verify_checksum_sidecar "${artifact}"; then
    ch_backup_log "verify fail: checksum ${artifact}"
    return 1
  fi

  if [[ "${artifact}" == *.gpg ]]; then
    temp_zip="$(mktemp "${CH_BACKUP_STAGING_DIR}/verify.XXXXXX.zip")"
    if [[ -n "${CH_BACKUP_GPG_RECIPIENT}" ]]; then
      gpg --batch --yes --decrypt --output "${temp_zip}" "${artifact}"
    elif [[ -f "${CH_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
      gpg --batch --yes --passphrase-file "${CH_BACKUP_GPG_PASSPHRASE_FILE}" \
        --decrypt --output "${temp_zip}" "${artifact}"
    else
      ch_backup_log "verify fail: cannot decrypt ${artifact}"
      return 1
    fi
    verify_zip="${temp_zip}"
  fi

  if [[ "${verify_zip}" == *.zip ]]; then
    ch_backup_verify_zip_integrity "${verify_zip}" || {
      [[ -n "${temp_zip}" ]] && rm -f "${temp_zip}"
      return 1
    }
  fi
  [[ -n "${temp_zip}" ]] && rm -f "${temp_zip}"
  return 0
}

ch_backup_list_valid_archives() {
  local dir="$1"
  local f
  for f in "${dir}"/synqdrive-*.zip "${dir}"/synqdrive-*.zip.gpg; do
    [[ -f "${f}" ]] || continue
    if ch_backup_verify_artifact "${f}"; then
      printf '%s\n' "${f}"
    fi
  done | sort
}

ch_backup_count_valid_archives() {
  ch_backup_list_valid_archives "${CH_BACKUP_ARCHIVE_DIR}" | wc -l | tr -d ' '
}

ch_backup_encrypt_file() {
  local plain="$1"
  local encrypted="$2"
  if [[ -n "${CH_BACKUP_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --trust-model always \
      --encrypt --recipient "${CH_BACKUP_GPG_RECIPIENT}" \
      --output "${encrypted}" "${plain}"
  elif [[ -f "${CH_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-file "${CH_BACKUP_GPG_PASSPHRASE_FILE}" \
      --output "${encrypted}" "${plain}"
  else
    cp "${plain}" "${encrypted}"
  fi
}

ch_backup_promote_artifact() {
  local staging_final="$1"
  local archive_path="${CH_BACKUP_ARCHIVE_DIR}/$(basename "${staging_final}")"
  if [[ -e "${archive_path}" ]]; then
    ch_backup_log "refusing to overwrite existing archive ${archive_path}"
    return 1
  fi
  mv "${staging_final}" "${archive_path}"
  printf '%s' "${archive_path}"
}

ch_backup_run_logical_backup() {
  local backup_name="$1"
  ch_backup_log "logical BACKUP DATABASE ${CH_BACKUP_DATABASE} TO Disk('${CH_BACKUP_DISK_NAME}', '${backup_name}')"
  ch_backup_client_query "BACKUP DATABASE ${CH_BACKUP_DATABASE} TO Disk('${CH_BACKUP_DISK_NAME}', '${backup_name}')"
}

ch_backup_query_backup_log_status() {
  local backup_name="$1"
  local status
  status="$(ch_backup_client_query "
    SELECT status
    FROM system.backup_log
    WHERE backup_name = '${backup_name}'
    ORDER BY event_time_microseconds DESC
    LIMIT 1
    FORMAT TabSeparated
  " 2>/dev/null || true)"
  printf '%s' "${status}"
}

ch_backup_write_meta_json() {
  local artifact="$1"
  local checksum="$2"
  local backup_name="$3"
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
  "label": "${CH_BACKUP_LABEL}",
  "database": "${CH_BACKUP_DATABASE}",
  "format": "clickhouse-native-zip",
  "clickhouse_backup_name": "${backup_name}",
  "encrypted": ${encrypted},
  "size_bytes": ${size},
  "sha256": "${checksum}",
  "integrity_verified_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "container": "${CH_BACKUP_CONTAINER}",
  "hostname": $(python3 -c "import json; print(json.dumps('${host}'))")
}
EOF
  chmod 600 "${meta}" 2>/dev/null || true
}

ch_backup_append_manifest() {
  local artifact="$1"
  local meta="${artifact}.meta.json"
  if [[ -f "${meta}" ]]; then
    printf '%s\n' "$(tr -d '\n' < "${meta}")" >> "${CH_BACKUP_MANIFEST}"
  fi
}

ch_backup_write_last_success() {
  local artifact="$1"
  local checksum="$2"
  cat > "${CH_BACKUP_STATE_DIR}/last-success.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "artifact": "${artifact}",
  "sha256": "${checksum}",
  "label": "${CH_BACKUP_LABEL}"
}
EOF
  chmod 600 "${CH_BACKUP_STATE_DIR}/last-success.json" 2>/dev/null || true
}

ch_backup_copy_offsite() {
  local artifact="$1"
  if [[ "${CH_BACKUP_SKIP_OFFSITE}" == "true" || "${CH_BACKUP_OFFSITE_MODE}" == "none" ]]; then
    ch_backup_log "offsite copy skipped"
    return 0
  fi
  case "${CH_BACKUP_OFFSITE_MODE}" in
    rclone)
      ch_backup_log "offsite: rclone → ${CH_BACKUP_RCLONE_REMOTE}"
      rclone copy "${artifact}" "${CH_BACKUP_RCLONE_REMOTE}/" --checksum --immutable
      rclone copy "${artifact}.sha256" "${CH_BACKUP_RCLONE_REMOTE}/" --immutable
      rclone copy "${artifact}.meta.json" "${CH_BACKUP_RCLONE_REMOTE}/" --immutable
      ;;
    s3)
      ch_backup_log "offsite: s3 → ${CH_BACKUP_S3_URI}"
      aws s3 cp "${artifact}" "${CH_BACKUP_S3_URI}/$(basename "${artifact}")" --only-show-errors
      aws s3 cp "${artifact}.sha256" "${CH_BACKUP_S3_URI}/$(basename "${artifact}").sha256" --only-show-errors
      aws s3 cp "${artifact}.meta.json" "${CH_BACKUP_S3_URI}/$(basename "${artifact}").meta.json" --only-show-errors
      ;;
  esac
}

ch_backup_rotate_local() {
  local valid_count min_keep deleted=0
  if [[ "${CH_BACKUP_SKIP_ROTATION}" == "true" ]]; then
    ch_backup_log "rotation skipped"
    return 0
  fi
  valid_count="$(ch_backup_count_valid_archives)"
  min_keep="${CH_BACKUP_MIN_GENERATIONS}"
  if [[ "${valid_count}" -le "${min_keep}" ]]; then
    ch_backup_log "rotation: ${valid_count} valid generation(s) — keeping all (min ${min_keep})"
    return 0
  fi
  local f age_days
  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    valid_count="$(ch_backup_count_valid_archives)"
    if [[ "${valid_count}" -le "${min_keep}" ]]; then
      break
    fi
    age_days=$(( ( $(date +%s) - $(stat -c%Y "${f}" 2>/dev/null || stat -f%m "${f}") ) / 86400 ))
    if [[ "${age_days}" -lt "${CH_BACKUP_LOCAL_RETENTION_DAYS}" ]]; then
      continue
    fi
    ch_backup_log "rotation: removing ${f} (age ${age_days}d)"
    rm -f "${f}" "${f}.sha256" "${f}.meta.json"
    deleted=$((deleted + 1))
    valid_count="$(ch_backup_count_valid_archives)"
    if [[ "${valid_count}" -lt "${min_keep}" ]]; then
      ch_backup_die "rotation safety: valid generations below ${min_keep}"
    fi
  done < <(ch_backup_list_valid_archives "${CH_BACKUP_ARCHIVE_DIR}")
  ch_backup_log "rotation: removed ${deleted}; $(ch_backup_count_valid_archives) valid remain"
}

ch_backup_cleanup_container_mount() {
  local mount_path="$1"
  local keep_name="$2"
  local retention_days="${CH_BACKUP_CONTAINER_MOUNT_RETENTION_DAYS:-7}"
  if [[ "${CH_BACKUP_SKIP_CONTAINER_MOUNT_CLEANUP}" == "true" ]]; then
    return 0
  fi
  local f age_days
  for f in "${mount_path}"/synqdrive-*.zip "${mount_path}"/synqdrive_*.zip; do
    [[ -f "${f}" ]] || continue
    [[ "$(basename "${f}")" == "${keep_name}" ]] && continue
    age_days=$(( ( $(date +%s) - $(stat -c%Y "${f}" 2>/dev/null || stat -f%m "${f}") ) / 86400 ))
    if [[ "${age_days}" -ge "${retention_days}" ]]; then
      ch_backup_log "container mount cleanup: removing ${f}"
      rm -f "${f}"
    fi
  done
}
