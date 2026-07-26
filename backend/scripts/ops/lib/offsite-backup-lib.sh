#!/usr/bin/env bash
# SynqDrive — Unified offsite backup library (Phase 2C.5).
# Encrypted copy, versioning, retention, integrity verification, notifications.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# shellcheck disable=SC2034
OFFSITE_BACKUP_LIB_VERSION="2c5.1"

offsite_defaults() {
  OFFSITE_ENV_FILE="${OFFSITE_ENV_FILE:-/opt/synqdrive/shared/offsite-backup.env}"
  OFFSITE_BACKEND_ENV="${OFFSITE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
  OFFSITE_STATE_DIR="${OFFSITE_STATE_DIR:-/opt/synqdrive/shared/backups/offsite/state}"
  OFFSITE_MANIFEST="${OFFSITE_MANIFEST:-/opt/synqdrive/shared/backups/offsite/manifest.jsonl}"
  OFFSITE_SYNC_INDEX="${OFFSITE_SYNC_INDEX:-${OFFSITE_STATE_DIR}/sync-index.json}"

  OFFSITE_MODE="${OFFSITE_MODE:-none}"
  OFFSITE_RCLONE_REMOTE="${OFFSITE_RCLONE_REMOTE:-}"
  OFFSITE_S3_URI="${OFFSITE_S3_URI:-}"
  OFFSITE_REQUIRED="${OFFSITE_REQUIRED:-true}"
  OFFSITE_CENTRAL_SYNC="${OFFSITE_CENTRAL_SYNC:-true}"

  OFFSITE_NOTIFY_EMAIL="${OFFSITE_NOTIFY_EMAIL:-}"
  OFFSITE_NOTIFY_ON_SUCCESS="${OFFSITE_NOTIFY_ON_SUCCESS:-false}"
  OFFSITE_HOSTNAME="${OFFSITE_HOSTNAME:-$(hostname -f 2>/dev/null || hostname)}"

  OFFSITE_GPG_RECIPIENT="${OFFSITE_GPG_RECIPIENT:-}"
  OFFSITE_GPG_PASSPHRASE_FILE="${OFFSITE_GPG_PASSPHRASE_FILE:-}"
  OFFSITE_REQUIRE_ENCRYPTION="${OFFSITE_REQUIRE_ENCRYPTION:-true}"

  # tier_name:local_glob_dir:remote_subpath:retention_days:min_generations
  OFFSITE_TIER_POSTGRESQL="${OFFSITE_TIER_POSTGRESQL:-postgresql:/opt/synqdrive/shared/backups/postgresql/daily:postgresql:90:2}"
  OFFSITE_TIER_CLICKHOUSE="${OFFSITE_TIER_CLICKHOUSE:-clickhouse:/opt/synqdrive/shared/backups/clickhouse/daily:clickhouse:30:2}"
  OFFSITE_TIER_REDIS="${OFFSITE_TIER_REDIS:-redis:/opt/synqdrive/shared/backups/redis/daily:redis:30:2}"
  OFFSITE_TIER_ENV="${OFFSITE_TIER_ENV:-env:/opt/synqdrive/shared/backups/env/daily:env:90:2}"
}

offsite_log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

offsite_die() {
  offsite_log "ERROR: $*"
  offsite_notify_failure "SynqDrive offsite backup FAILED" "$*"
  exit 1
}

offsite_load_env() {
  if [[ -f "${OFFSITE_ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${OFFSITE_ENV_FILE}"
    set +a
  fi
}

offsite_ensure_dirs() {
  mkdir -p "${OFFSITE_STATE_DIR}"
  chmod 700 "${OFFSITE_STATE_DIR}" 2>/dev/null || true
  touch "${OFFSITE_MANIFEST}"
  chmod 600 "${OFFSITE_MANIFEST}" 2>/dev/null || true
}

offsite_read_backend_var() {
  local key="$1"
  local default="${2:-}"
  if [[ ! -f "${OFFSITE_BACKEND_ENV}" ]]; then
    printf '%s' "${default}"
    return 0
  fi
  local line val
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ "${line}" == "${key}="* ]] || continue
    val="${line#*=}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    printf '%s' "${val}"
    return 0
  done < "${OFFSITE_BACKEND_ENV}"
  printf '%s' "${default}"
}

offsite_validate_config() {
  if [[ "${OFFSITE_REQUIRED}" == "true" && "${OFFSITE_MODE}" == "none" ]]; then
    offsite_die "OFFSITE_MODE=none not allowed when OFFSITE_REQUIRED=true — configure rclone or s3"
  fi
  case "${OFFSITE_MODE}" in
    none) ;;
    rclone)
      command -v rclone >/dev/null 2>&1 || offsite_die "rclone not installed"
      [[ -n "${OFFSITE_RCLONE_REMOTE}" ]] || offsite_die "OFFSITE_RCLONE_REMOTE required"
      ;;
    s3)
      command -v aws >/dev/null 2>&1 || offsite_die "aws cli not installed"
      [[ -n "${OFFSITE_S3_URI}" ]] || offsite_die "OFFSITE_S3_URI required"
      ;;
    *)
      offsite_die "invalid OFFSITE_MODE=${OFFSITE_MODE}"
      ;;
  esac
  if [[ -z "${OFFSITE_NOTIFY_EMAIL}" ]]; then
    offsite_log "WARN: OFFSITE_NOTIFY_EMAIL unset — failure alerts log-only"
  fi
}

offsite_sha256() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${f}" | awk '{print $1}'
  else
    shasum -a 256 "${f}" | awk '{print $1}'
  fi
}

offsite_verify_checksum_sidecar() {
  local artifact="$1"
  local sidecar="${artifact}.sha256"
  [[ -f "${sidecar}" ]] || return 1
  local dir base
  dir="$(dirname "${artifact}")"
  base="$(basename "${artifact}")"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "${dir}" && sha256sum -c "${base}.sha256" >/dev/null 2>&1)
  else
    (cd "${dir}" && shasum -a 256 -c "${base}.sha256" >/dev/null 2>&1)
  fi
}

offsite_artifact_allowed() {
  local artifact="$1"
  if [[ "${OFFSITE_REQUIRE_ENCRYPTION}" == "true" ]]; then
    [[ "${artifact}" == *.gpg ]] || return 1
  fi
  return 0
}

offsite_remote_uri() {
  local subpath="$1"
  local basename="$2"
  case "${OFFSITE_MODE}" in
    rclone) printf '%s/%s/%s' "${OFFSITE_RCLONE_REMOTE}" "${subpath}" "${basename}" ;;
    s3) printf '%s/%s/%s' "${OFFSITE_S3_URI}" "${subpath}" "${basename}" ;;
  esac
}

offsite_upload_file() {
  local local_path="$1"
  local remote_subpath="$2"
  local basename
  basename="$(basename "${local_path}")"
  case "${OFFSITE_MODE}" in
    rclone)
      rclone copyto "${local_path}" "$(offsite_remote_uri "${remote_subpath}" "${basename}")" \
        --checksum --immutable
      ;;
    s3)
      aws s3 cp "${local_path}" "$(offsite_remote_uri "${remote_subpath}" "${basename}")" --only-show-errors
      ;;
  esac
}

offsite_remote_exists_with_size() {
  local remote_subpath="$1"
  local basename="$2"
  local expected_size="$3"
  local uri got
  uri="$(offsite_remote_uri "${remote_subpath}" "${basename}")"
  case "${OFFSITE_MODE}" in
    rclone)
      if ! rclone lsf "${uri}" >/dev/null 2>&1; then
        return 1
      fi
      got="$(rclone lsl "${uri}" 2>/dev/null | awk '{print $1}' | head -1 || echo 0)"
      [[ -n "${got}" && "${got}" == "${expected_size}" ]]
      ;;
    s3)
      got="$(aws s3 ls "${uri}" 2>/dev/null | awk '{print $3}' || echo "")"
      [[ -n "${got}" && "${got}" == "${expected_size}" ]]
      ;;
    *)
      return 1
      ;;
  esac
}

offsite_sync_artifact() {
  local artifact="$1"
  local remote_subpath="$2"
  local checksum size basename
  if ! offsite_artifact_allowed "${artifact}"; then
    offsite_log "SKIP (not encrypted): ${artifact}"
    return 0
  fi
  if ! offsite_verify_checksum_sidecar "${artifact}"; then
    offsite_die "local integrity failed: ${artifact}"
  fi
  checksum="$(awk '{print $1}' "${artifact}.sha256")"
  size="$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")"
  basename="$(basename "${artifact}")"

  if offsite_remote_exists_with_size "${remote_subpath}" "${basename}" "${size}"; then
    offsite_log "SKIP (already offsite): ${basename}"
    return 0
  fi

  offsite_log "upload: ${basename} → ${remote_subpath}"
  offsite_upload_file "${artifact}" "${remote_subpath}"
  offsite_upload_file "${artifact}.sha256" "${remote_subpath}"
  if [[ -f "${artifact}.meta.json" ]]; then
    offsite_upload_file "${artifact}.meta.json" "${remote_subpath}"
  fi

  if ! offsite_remote_exists_with_size "${remote_subpath}" "${basename}" "${size}"; then
    offsite_die "offsite verify failed after upload: ${basename}"
  fi

  export OFFSITE_SYNC_ARTIFACT="${artifact}"
  export OFFSITE_SYNC_REMOTE="${remote_subpath}"
  export OFFSITE_SYNC_BASENAME="${basename}"
  export OFFSITE_SYNC_SHA="${checksum}"
  export OFFSITE_SYNC_SIZE="${size}"
  python3 - <<'PY' >> "${OFFSITE_MANIFEST}"
import json, datetime, os
print(json.dumps({
  "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
  "artifact": os.environ["OFFSITE_SYNC_ARTIFACT"],
  "remote_subpath": os.environ["OFFSITE_SYNC_REMOTE"],
  "basename": os.environ["OFFSITE_SYNC_BASENAME"],
  "sha256": os.environ["OFFSITE_SYNC_SHA"],
  "size_bytes": int(os.environ["OFFSITE_SYNC_SIZE"]),
  "host": os.environ.get("OFFSITE_HOSTNAME", ""),
}))
PY
}

offsite_parse_tier() {
  local spec="$1"
  TIER_NAME="${spec%%:*}"
  local rest="${spec#*:}"
  TIER_DIR="${rest%%:*}"
  rest="${rest#*:}"
  TIER_REMOTE="${rest%%:*}"
  rest="${rest#*:}"
  TIER_RETENTION_DAYS="${rest%%:*}"
  TIER_MIN_GEN="${rest##*:}"
}

offsite_list_tier_artifacts() {
  local dir="$1"
  local f
  shopt -s nullglob
  for f in "${dir}"/*; do
    [[ -f "${f}" ]] || continue
    [[ "${f}" == *.sha256 ]] && continue
    [[ "${f}" == *.meta.json ]] && continue
    if offsite_verify_checksum_sidecar "${f}"; then
      printf '%s\n' "${f}"
    fi
  done | sort
  shopt -u nullglob
}

offsite_rotate_remote_tier() {
  local remote_subpath="$1"
  local retention_days="$2"
  local min_gen="$3"
  offsite_log "remote retention: ${remote_subpath} (>${retention_days}d, min ${min_gen})"
  case "${OFFSITE_MODE}" in
    rclone)
      local base="${OFFSITE_RCLONE_REMOTE}/${remote_subpath}"
      local count
      count="$(rclone lsf "${base}/" --files-only 2>/dev/null | grep -E '\.(gpg|dump\.gpg|rdb\.gpg|zip\.gpg|tar\.gpg)$' | wc -l | tr -d ' ')"
      if [[ "${count}" -le "${min_gen}" ]]; then
        offsite_log "remote rotate: ${count} artifact(s) — keeping all"
        return 0
      fi
      rclone delete "${base}/" --min-age "${retention_days}d" --include "*.gpg" --include "*.sha256" --include "*.meta.json" 2>/dev/null || true
      count="$(rclone lsf "${base}/" --files-only 2>/dev/null | grep -E '\.gpg$' | wc -l | tr -d ' ')"
      if [[ "${count}" -lt "${min_gen}" ]]; then
        offsite_die "remote retention safety: ${remote_subpath} below min ${min_gen} generations"
      fi
      ;;
    s3)
      offsite_log "remote retention: configure S3 lifecycle on ${OFFSITE_S3_URI}/${remote_subpath}/ (>= ${retention_days}d, min ${min_gen} versions)"
      ;;
  esac
}

offsite_notify_failure() {
  local subject="$1"
  local body="$2"
  offsite_log "ALERT: ${subject} — ${body}"
  cat > "${OFFSITE_STATE_DIR}/last-failure.json" <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","subject":$(python3 -c "import json; print(json.dumps('${subject}'))"),"body":$(python3 -c "import json; print(json.dumps('''${body}'''))")}
EOF
  if [[ -z "${OFFSITE_NOTIFY_EMAIL}" ]]; then
    return 0
  fi
  local api_key from
  api_key="$(offsite_read_backend_var RESEND_API_KEY)"
  from="$(offsite_read_backend_var EMAIL_DEFAULT_FROM "ops@synqdrive.eu")"
  if [[ -z "${api_key}" ]]; then
    offsite_log "WARN: RESEND_API_KEY missing — cannot email alert"
    return 0
  fi
  python3 - <<PY
import json, os, urllib.request
payload = {
  "from": "${from}",
  "to": ["${OFFSITE_NOTIFY_EMAIL}"],
  "subject": ${json.dumps(subject)},
  "text": ${json.dumps(body + "\n\nHost: " + os.environ.get("OFFSITE_HOSTNAME", "unknown"))},
}
req = urllib.request.Request(
  "https://api.resend.com/emails",
  data=json.dumps(payload).encode(),
  headers={"Authorization": f"Bearer ${api_key}", "Content-Type": "application/json"},
  method="POST",
)
try:
  with urllib.request.urlopen(req, timeout=30) as resp:
    print("notify:", resp.status)
except Exception as e:
    print("notify failed:", e)
PY
}

offsite_notify_success() {
  [[ "${OFFSITE_NOTIFY_ON_SUCCESS}" == "true" ]] || return 0
  local api_key from
  api_key="$(offsite_read_backend_var RESEND_API_KEY)"
  from="$(offsite_read_backend_var EMAIL_DEFAULT_FROM "ops@synqdrive.eu")"
  [[ -n "${api_key}" && -n "${OFFSITE_NOTIFY_EMAIL}" ]] || return 0
  python3 - <<PY
import json, urllib.request
payload = {"from": "${from}", "to": ["${OFFSITE_NOTIFY_EMAIL}"],
  "subject": "SynqDrive offsite backup OK",
  "text": "Offsite sync completed on ${OFFSITE_HOSTNAME}"}
req = urllib.request.Request("https://api.resend.com/emails",
  data=json.dumps(payload).encode(),
  headers={"Authorization": "Bearer ${api_key}", "Content-Type": "application/json"}, method="POST")
urllib.request.urlopen(req, timeout=30)
PY
}

offsite_write_last_success() {
  cat > "${OFFSITE_STATE_DIR}/last-success.json" <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","mode":"${OFFSITE_MODE}","host":"${OFFSITE_HOSTNAME}"}
EOF
  rm -f "${OFFSITE_STATE_DIR}/last-failure.json" 2>/dev/null || true
}

offsite_tier_specs() {
  printf '%s\n' \
    "${OFFSITE_TIER_POSTGRESQL}" \
    "${OFFSITE_TIER_CLICKHOUSE}" \
    "${OFFSITE_TIER_REDIS}" \
    "${OFFSITE_TIER_ENV}"
}

offsite_gpg_encrypt_file() {
  local plain="$1"
  local encrypted="$2"
  if [[ -n "${OFFSITE_GPG_RECIPIENT}" ]]; then
    gpg --batch --yes --trust-model always \
      --encrypt --recipient "${OFFSITE_GPG_RECIPIENT}" \
      --output "${encrypted}" "${plain}"
  elif [[ -f "${OFFSITE_GPG_PASSPHRASE_FILE}" ]]; then
    gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase-file "${OFFSITE_GPG_PASSPHRASE_FILE}" \
      --output "${encrypted}" "${plain}"
  else
    offsite_die "GPG not configured for encryption"
  fi
}
