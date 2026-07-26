#!/usr/bin/env bash
# SynqDrive — Redis backup shared library (sourced, not executed directly).
# Phase 2C.4 — RDB snapshot backup for BullMQ queue buffer (Postgres remains SoT).

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# shellcheck disable=SC2034
REDIS_BACKUP_LIB_VERSION="2c4.1"

redis_backup_defaults() {
  REDIS_BACKUP_ROOT="${REDIS_BACKUP_ROOT:-/opt/synqdrive/shared/backups/redis}"
  REDIS_BACKUP_STAGING_DIR="${REDIS_BACKUP_STAGING_DIR:-${REDIS_BACKUP_ROOT}/staging}"
  REDIS_BACKUP_ARCHIVE_DIR="${REDIS_BACKUP_ARCHIVE_DIR:-${REDIS_BACKUP_ROOT}/daily}"
  REDIS_BACKUP_STATE_DIR="${REDIS_BACKUP_STATE_DIR:-${REDIS_BACKUP_ROOT}/state}"
  REDIS_BACKUP_MANIFEST="${REDIS_BACKUP_MANIFEST:-${REDIS_BACKUP_ROOT}/manifest.jsonl}"
  REDIS_BACKUP_ENV_FILE="${REDIS_BACKUP_ENV_FILE:-/opt/synqdrive/shared/redis-backup.env}"
  REDIS_BACKUP_BACKEND_ENV="${REDIS_BACKUP_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

  REDIS_BACKUP_HOST="${REDIS_BACKUP_HOST:-127.0.0.1}"
  REDIS_BACKUP_PORT="${REDIS_BACKUP_PORT:-6379}"
  REDIS_BACKUP_PASSWORD="${REDIS_BACKUP_PASSWORD:-}"
  REDIS_BACKUP_DB="${REDIS_BACKUP_DB:-0}"

  REDIS_BACKUP_LABEL="${REDIS_BACKUP_LABEL:-daily}"
  REDIS_BACKUP_MIN_GENERATIONS="${REDIS_BACKUP_MIN_GENERATIONS:-2}"
  REDIS_BACKUP_LOCAL_RETENTION_DAYS="${REDIS_BACKUP_LOCAL_RETENTION_DAYS:-7}"
  REDIS_BACKUP_DISK_WARN_PCT="${REDIS_BACKUP_DISK_WARN_PCT:-85}"
  REDIS_BACKUP_DISK_ABORT_PCT="${REDIS_BACKUP_DISK_ABORT_PCT:-90}"
  REDIS_BACKUP_MIN_BYTES="${REDIS_BACKUP_MIN_BYTES:-128}"

  REDIS_BACKUP_SKIP_ROTATION="${REDIS_BACKUP_SKIP_ROTATION:-false}"
  REDIS_BACKUP_SKIP_OFFSITE="${REDIS_BACKUP_SKIP_OFFSITE:-false}"
  REDIS_BACKUP_ALLOW_UNENCRYPTED="${REDIS_BACKUP_ALLOW_UNENCRYPTED:-false}"

  REDIS_BACKUP_OFFSITE_MODE="${REDIS_BACKUP_OFFSITE_MODE:-none}"
  REDIS_BACKUP_RCLONE_REMOTE="${REDIS_BACKUP_RCLONE_REMOTE:-}"
  REDIS_BACKUP_S3_URI="${REDIS_BACKUP_S3_URI:-}"

  REDIS_BACKUP_GPG_RECIPIENT="${REDIS_BACKUP_GPG_RECIPIENT:-}"
  REDIS_BACKUP_GPG_PASSPHRASE_FILE="${REDIS_BACKUP_GPG_PASSPHRASE_FILE:-}"

  REDIS_BACKUP_PERSISTENCE_CONF="${REDIS_BACKUP_PERSISTENCE_CONF:-/opt/synqdrive/shared/redis/synqdrive-persistence.conf}"
}

redis_backup_log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

redis_backup_die() {
  redis_backup_log "ERROR: $*"
  exit 1
}

redis_backup_load_env_file() {
  if [[ -f "${REDIS_BACKUP_ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${REDIS_BACKUP_ENV_FILE}"
    set +a
  fi
}

redis_backup_load_backend_credentials() {
  if [[ -n "${REDIS_BACKUP_PASSWORD}" ]]; then
    return 0
  fi
  if [[ ! -f "${REDIS_BACKUP_BACKEND_ENV}" ]]; then
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
      REDIS_HOST) REDIS_BACKUP_HOST="${val}" ;;
      REDIS_PORT) REDIS_BACKUP_PORT="${val}" ;;
      REDIS_PASSWORD) REDIS_BACKUP_PASSWORD="${val}" ;;
      REDIS_DB) REDIS_BACKUP_DB="${val}" ;;
    esac
  done < "${REDIS_BACKUP_BACKEND_ENV}"
}

redis_backup_cli() {
  local args=(-h "${REDIS_BACKUP_HOST}" -p "${REDIS_BACKUP_PORT}" -n "${REDIS_BACKUP_DB}")
  if [[ -n "${REDIS_BACKUP_PASSWORD}" ]]; then
    args+=(-a "${REDIS_BACKUP_PASSWORD}")
  fi
  redis-cli "${args[@]}" "$@"
}

redis_backup_ensure_dirs() {
  mkdir -p "${REDIS_BACKUP_STAGING_DIR}" "${REDIS_BACKUP_ARCHIVE_DIR}" "${REDIS_BACKUP_STATE_DIR}"
  chmod 700 "${REDIS_BACKUP_ROOT}" "${REDIS_BACKUP_STAGING_DIR}" "${REDIS_BACKUP_STATE_DIR}" 2>/dev/null || true
}

redis_backup_check_disk() {
  local disk_use_pct
  disk_use_pct="$(df "${REDIS_BACKUP_ROOT}" | tail -1 | awk '{print $5}' | tr -d '%')"
  if [[ "${disk_use_pct}" -ge "${REDIS_BACKUP_DISK_ABORT_PCT}" ]]; then
    redis_backup_die "filesystem ${disk_use_pct}% full (abort >= ${REDIS_BACKUP_DISK_ABORT_PCT}%)"
  fi
  if [[ "${disk_use_pct}" -ge "${REDIS_BACKUP_DISK_WARN_PCT}" ]]; then
    redis_backup_log "WARN: filesystem ${disk_use_pct}% full"
  fi
}

redis_backup_encryption_enabled() {
  [[ -n "${REDIS_BACKUP_GPG_RECIPIENT}" || -f "${REDIS_BACKUP_GPG_PASSPHRASE_FILE}" ]]
}

redis_backup_validate_config() {
  if ! command -v redis-cli >/dev/null 2>&1; then
    redis_backup_die "redis-cli not found"
  fi
  if ! command -v redis-check-rdb >/dev/null 2>&1; then
    redis_backup_die "redis-check-rdb not found (install redis-tools)"
  fi
  if ! redis_backup_cli PING | grep -q PONG; then
    redis_backup_die "redis not reachable at ${REDIS_BACKUP_HOST}:${REDIS_BACKUP_PORT}"
  fi
  if ! redis_backup_encryption_enabled; then
    if [[ "${REDIS_BACKUP_ALLOW_UNENCRYPTED}" != "true" ]]; then
      redis_backup_die "encryption required — set REDIS_BACKUP_GPG_RECIPIENT or REDIS_BACKUP_GPG_PASSPHRASE_FILE"
    fi
    redis_backup_log "WARN: unencrypted archives allowed (dev only)"
  fi
  case "${REDIS_BACKUP_OFFSITE_MODE}" in
    none) ;;
    rclone)
      if [[ "${REDIS_BACKUP_SKIP_OFFSITE}" != "true" && -z "${REDIS_BACKUP_RCLONE_REMOTE}" ]]; then
        redis_backup_die "REDIS_BACKUP_OFFSITE_MODE=rclone requires REDIS_BACKUP_RCLONE_REMOTE"
      fi
      ;;
    s3)
      if [[ "${REDIS_BACKUP_SKIP_OFFSITE}" != "true" && -z "${REDIS_BACKUP_S3_URI}" ]]; then
        redis_backup_die "REDIS_BACKUP_OFFSITE_MODE=s3 requires REDIS_BACKUP_S3_URI"
      fi
      ;;
    *)
      redis_backup_die "invalid REDIS_BACKUP_OFFSITE_MODE=${REDIS_BACKUP_OFFSITE_MODE}"
      ;;
  esac
}

redis_backup_base_name() {
  printf 'redis-%s-%s' "${REDIS_BACKUP_LABEL}" "$(date -u +%Y%m%dT%H%M%SZ)"
}

redis_backup_sha256_file() {
  local target="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${target}" | awk '{print $1}'
  else
    shasum -a 256 "${target}" | awk '{print $1}'
  fi
}

redis_backup_write_checksum_sidecar() {
  local artifact="$1"
  local checksum
  checksum="$(redis_backup_sha256_file "${artifact}")"
  printf '%s  %s\n' "${checksum}" "$(basename "${artifact}")" > "${artifact}.sha256"
  printf '%s' "${checksum}"
}

redis_backup_verify_checksum_sidecar() {
  local artifact="$1"
  local sidecar="${artifact}.sha256"
  [[ -f "${sidecar}" ]] || return 1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "${sidecar}" >/dev/null 2>&1
  else
    shasum -a 256 -c "${sidecar}" >/dev/null 2>&1
  fi
}

redis_backup_verify_rdb() {
  local rdb_path="$1"
  redis-check-rdb "${rdb_path}" >/dev/null 2>&1
}

redis_backup_verify_artifact() {
  local artifact="$1"
  local verify_rdb="${artifact}"
  local temp_rdb=""

  if [[ ! -s "${artifact}" ]]; then
    return 1
  fi
  if [[ "$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")" -lt "${REDIS_BACKUP_MIN_BYTES}" ]]; then
    return 1
  fi
  if ! redis_backup_verify_checksum_sidecar "${artifact}"; then
    return 1
  fi

  if [[ "${artifact}" == *.gpg ]]; then
    temp_rdb="$(mktemp "${REDIS_BACKUP_STAGING_DIR}/verify.XXXXXX.rdb")"
    if [[ -n "${REDIS_BACKUP_GPG_RECIPIENT}" ]]; then
      gpg --batch --yes --decrypt --output "${temp_rdb}" "${artifact}"
    elif [[ -f "${REDIS_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
      gpg --batch --yes --passphrase-file "${REDIS_BACKUP_GPG_PASSPHRASE_FILE}" \
        --decrypt --output "${temp_rdb}" "${artifact}"
    else
      return 1
    fi
    verify_rdb="${temp_rdb}"
  fi

  if ! redis_backup_verify_rdb "${verify_rdb}"; then
    [[ -n "${temp_rdb}" ]] && rm -f "${temp_rdb}"
    return 1
  fi
  [[ -n "${temp_rdb}" ]] && rm -f "${temp_rdb}"
  return 0
}

redis_backup_list_valid_archives() {
  local dir="$1"
  local f
  for f in "${dir}"/redis-*.rdb "${dir}"/redis-*.rdb.gpg; do
    [[ -f "${f}" ]] || continue
    if redis_backup_verify_artifact "${f}"; then
      printf '%s\n' "${f}"
    fi
  done | sort
}

redis_backup_count_valid_archives() {
  redis_backup_list_valid_archives "${REDIS_BACKUP_ARCHIVE_DIR}" | wc -l | tr -d ' '
}

redis_backup_encrypt_file() {
  local plain="$1"
  local encrypted="$2"
  if [[ -n "${REDIS_BACKUP_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --trust-model always \
      --encrypt --recipient "${REDIS_BACKUP_GPG_RECIPIENT}" \
      --output "${encrypted}" "${plain}"
  elif [[ -f "${REDIS_BACKUP_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-file "${REDIS_BACKUP_GPG_PASSPHRASE_FILE}" \
      --output "${encrypted}" "${plain}"
  else
    cp "${plain}" "${encrypted}"
  fi
}

redis_backup_promote_artifact() {
  local staging_final="$1"
  local archive_path="${REDIS_BACKUP_ARCHIVE_DIR}/$(basename "${staging_final}")"
  if [[ -e "${archive_path}" ]]; then
    redis_backup_log "refusing to overwrite existing archive ${archive_path}"
    return 1
  fi
  mv "${staging_final}" "${archive_path}"
  printf '%s' "${archive_path}"
}

redis_backup_create_rdb_snapshot() {
  local target_path="$1"
  redis_backup_log "creating RDB snapshot via redis-cli --rdb"
  redis_backup_cli --rdb "${target_path}"
  [[ -s "${target_path}" ]] || return 1
  redis_backup_verify_rdb "${target_path}"
}

redis_backup_write_meta_json() {
  local artifact="$1"
  local checksum="$2"
  local meta="${artifact}.meta.json"
  local size encrypted="false" host key_count=""
  size="$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")"
  host="$(hostname -f 2>/dev/null || hostname)"
  key_count="$(redis_backup_cli DBSIZE 2>/dev/null | awk '{print $2}' || echo 'unknown')"
  if [[ "${artifact}" == *.gpg ]]; then
    encrypted="true"
  fi
  cat > "${meta}" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "label": "${REDIS_BACKUP_LABEL}",
  "format": "rdb",
  "encrypted": ${encrypted},
  "size_bytes": ${size},
  "sha256": "${checksum}",
  "redis_dbsize_at_backup": "${key_count}",
  "integrity_verified_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": $(python3 -c "import json; print(json.dumps('${host}'))"),
  "role": "bullmq-queue-buffer",
  "system_of_record": "postgresql"
}
EOF
  chmod 600 "${meta}" 2>/dev/null || true
}

redis_backup_append_manifest() {
  local artifact="$1"
  local meta="${artifact}.meta.json"
  if [[ -f "${meta}" ]]; then
    printf '%s\n' "$(tr -d '\n' < "${meta}")" >> "${REDIS_BACKUP_MANIFEST}"
  fi
}

redis_backup_write_last_success() {
  local artifact="$1"
  local checksum="$2"
  cat > "${REDIS_BACKUP_STATE_DIR}/last-success.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "artifact": "${artifact}",
  "sha256": "${checksum}",
  "label": "${REDIS_BACKUP_LABEL}"
}
EOF
  chmod 600 "${REDIS_BACKUP_STATE_DIR}/last-success.json" 2>/dev/null || true
}

redis_backup_copy_offsite() {
  local artifact="$1"
  if [[ "${REDIS_BACKUP_SKIP_OFFSITE}" == "true" || "${REDIS_BACKUP_OFFSITE_MODE}" == "none" ]]; then
    redis_backup_log "offsite copy skipped"
    return 0
  fi
  case "${REDIS_BACKUP_OFFSITE_MODE}" in
    rclone)
      rclone copy "${artifact}" "${REDIS_BACKUP_RCLONE_REMOTE}/" --checksum --immutable
      rclone copy "${artifact}.sha256" "${REDIS_BACKUP_RCLONE_REMOTE}/" --immutable
      rclone copy "${artifact}.meta.json" "${REDIS_BACKUP_RCLONE_REMOTE}/" --immutable
      ;;
    s3)
      aws s3 cp "${artifact}" "${REDIS_BACKUP_S3_URI}/$(basename "${artifact}")" --only-show-errors
      aws s3 cp "${artifact}.sha256" "${REDIS_BACKUP_S3_URI}/$(basename "${artifact}").sha256" --only-show-errors
      aws s3 cp "${artifact}.meta.json" "${REDIS_BACKUP_S3_URI}/$(basename "${artifact}").meta.json" --only-show-errors
      ;;
  esac
}

redis_backup_rotate_local() {
  local valid_count min_keep deleted=0
  if [[ "${REDIS_BACKUP_SKIP_ROTATION}" == "true" ]]; then
    return 0
  fi
  valid_count="$(redis_backup_count_valid_archives)"
  min_keep="${REDIS_BACKUP_MIN_GENERATIONS}"
  if [[ "${valid_count}" -le "${min_keep}" ]]; then
    redis_backup_log "rotation: ${valid_count} valid — keeping all (min ${min_keep})"
    return 0
  fi
  local f age_days
  while IFS= read -r f; do
    [[ -n "${f}" ]] || continue
    valid_count="$(redis_backup_count_valid_archives)"
    [[ "${valid_count}" -le "${min_keep}" ]] && break
    age_days=$(( ( $(date +%s) - $(stat -c%Y "${f}" 2>/dev/null || stat -f%m "${f}") ) / 86400 ))
    [[ "${age_days}" -lt "${REDIS_BACKUP_LOCAL_RETENTION_DAYS}" ]] && continue
    redis_backup_log "rotation: removing ${f}"
    rm -f "${f}" "${f}.sha256" "${f}.meta.json"
    deleted=$((deleted + 1))
    valid_count="$(redis_backup_count_valid_archives)"
    [[ "${valid_count}" -lt "${min_keep}" ]] && redis_backup_die "rotation safety: below ${min_keep} generations"
  done < <(redis_backup_list_valid_archives "${REDIS_BACKUP_ARCHIVE_DIR}")
  redis_backup_log "rotation: removed ${deleted}; $(redis_backup_count_valid_archives) valid remain"
}

# BullMQ queue names — keep in sync with backend/src/workers/queues/queue-names.ts
redis_backup_bullmq_queue_names() {
  cat <<'QUEUES'
dimo.snapshot.poll
dimo.vehicle.sync
dimo.dtc.poll
dimo.tire.recalculation
dimo.brake.recalculation
dimo.trip-tracking
trip.behavior.enrichment
trip.driving-impact.compute
driving.intelligence.jobs
document.extraction
booking.document.generation
dtc.knowledge.enrichment
notification.evaluation
notification.delivery
payment.email
task.automation
battery.v2
voice.webhook.process
connectivity.webhook.process
QUEUES
}

redis_backup_bullmq_inspect() {
  local q wait active delayed failed
  printf '%-40s %8s %8s %8s %8s\n' "QUEUE" "WAIT" "ACTIVE" "DELAYED" "FAILED"
  while IFS= read -r q; do
    [[ -n "${q}" ]] || continue
    wait="$(redis_backup_cli LLEN "bull:${q}:wait" 2>/dev/null || echo 0)"
    active="$(redis_backup_cli LLEN "bull:${q}:active" 2>/dev/null || echo 0)"
    delayed="$(redis_backup_cli ZCARD "bull:${q}:delayed" 2>/dev/null || echo 0)"
    failed="$(redis_backup_cli ZCARD "bull:${q}:failed" 2>/dev/null || echo 0)"
    printf '%-40s %8s %8s %8s %8s\n' "${q}" "${wait}" "${active}" "${delayed}" "${failed}"
  done < <(redis_backup_bullmq_queue_names)
}
