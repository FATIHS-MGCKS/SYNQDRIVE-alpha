#!/usr/bin/env bash
# SynqDrive — Unified offsite backup library (Phase 2C.5).
# Encrypted copy, versioning, retention, integrity verification, notifications.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# shellcheck disable=SC2034
OFFSITE_BACKUP_LIB_VERSION="2c5.2"

offsite_defaults() {
  OFFSITE_ENV_FILE="${OFFSITE_ENV_FILE:-/opt/synqdrive/shared/offsite-backup.env}"
  OFFSITE_BACKEND_ENV="${OFFSITE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
  OFFSITE_STATE_DIR="${OFFSITE_STATE_DIR:-/opt/synqdrive/shared/backups/offsite/state}"
  OFFSITE_MANIFEST="${OFFSITE_MANIFEST:-/opt/synqdrive/shared/backups/offsite/manifest.jsonl}"
  OFFSITE_SYNC_INDEX="${OFFSITE_SYNC_INDEX:-${OFFSITE_STATE_DIR}/sync-index.json}"
  OFFSITE_RCLONE_CONF="${OFFSITE_RCLONE_CONF:-/opt/synqdrive/shared/secrets/rclone.conf}"
  OFFSITE_RESILIENCE_JSON="${OFFSITE_RESILIENCE_JSON:-/opt/synqdrive/shared/resilience-status.json}"
  OFFSITE_PROM_TEXTFILE="${OFFSITE_PROM_TEXTFILE:-/opt/synqdrive/shared/node-exporter-textfile/synqdrive_backup.prom}"

  OFFSITE_MODE="${OFFSITE_MODE:-none}"
  OFFSITE_RCLONE_REMOTE="${OFFSITE_RCLONE_REMOTE:-}"
  OFFSITE_S3_URI="${OFFSITE_S3_URI:-}"
  OFFSITE_PATH_PREFIX="${OFFSITE_PATH_PREFIX:-production}"
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
  offsite_apply_rclone_config
}

offsite_apply_rclone_config() {
  if [[ -f "${OFFSITE_RCLONE_CONF}" ]]; then
    export RCLONE_CONFIG="${OFFSITE_RCLONE_CONF}"
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

offsite_is_plaintext_backup() {
  local artifact="$1"
  local base="${artifact##*/}"
  [[ "${base}" == *.gpg ]] && return 1
  [[ "${base}" == *.dump ]] && return 0
  [[ "${base}" == *.sql ]] && return 0
  [[ "${base}" == *.sql.gz ]] && return 0
  [[ "${base}" == *.rdb ]] && return 0
  [[ "${base}" == *.zip ]] && return 0
  [[ "${base}" == *.tar ]] && return 0
  [[ "${base}" == *.tar.gz ]] && return 0
  return 1
}

offsite_artifact_allowed() {
  local artifact="$1"
  if offsite_is_plaintext_backup "${artifact}"; then
    return 1
  fi
  if [[ "${OFFSITE_REQUIRE_ENCRYPTION}" == "true" ]]; then
    [[ "${artifact}" == *.gpg ]] || return 1
  fi
  return 0
}

offsite_remote_subpath() {
  local tier_path="$1"
  tier_path="${tier_path#/}"
  if [[ -n "${OFFSITE_PATH_PREFIX}" ]]; then
    printf '%s/%s' "${OFFSITE_PATH_PREFIX}" "${tier_path}"
  else
    printf '%s' "${tier_path}"
  fi
}

offsite_remote_uri() {
  local subpath="$1"
  local basename="$2"
  local fullpath
  fullpath="$(offsite_remote_subpath "${subpath}")"
  case "${OFFSITE_MODE}" in
    rclone) printf '%s/%s/%s' "${OFFSITE_RCLONE_REMOTE}" "${fullpath}" "${basename}" ;;
    s3) printf '%s/%s/%s' "${OFFSITE_S3_URI}" "${fullpath}" "${basename}" ;;
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

offsite_download_file() {
  local remote_subpath="$1"
  local basename="$2"
  local local_path="$3"
  local uri
  uri="$(offsite_remote_uri "${remote_subpath}" "${basename}")"
  case "${OFFSITE_MODE}" in
    rclone) rclone copyto "${uri}" "${local_path}" ;;
    s3) aws s3 cp "${uri}" "${local_path}" --only-show-errors ;;
    *) offsite_die "offsite download unsupported mode=${OFFSITE_MODE}" ;;
  esac
}

offsite_sync_artifact() {
  local artifact="$1"
  local remote_subpath="$2"
  local checksum size basename
  if ! offsite_artifact_allowed "${artifact}"; then
    offsite_die "plaintext upload blocked: ${artifact}"
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

  offsite_write_tier_state "${TIER_NAME:-unknown}" "${artifact}" "${remote_subpath}"

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
      local base="${OFFSITE_RCLONE_REMOTE}/$(offsite_remote_subpath "${remote_subpath}")"
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
  offsite_write_prometheus_metrics "$(date -u +%s)" 0 1
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

offsite_write_tier_state() {
  local tier="$1"
  local artifact="$2"
  local remote_subpath="$3"
  local ts size basename
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  basename="$(basename "${artifact}")"
  size="$(stat -c%s "${artifact}" 2>/dev/null || stat -f%z "${artifact}")"
  cat > "${OFFSITE_STATE_DIR}/tier-${tier}.json" <<EOF
{"timestamp":"${ts}","tier":"${tier}","artifact":"${basename}","remote_subpath":"${remote_subpath}","size_bytes":${size},"verified":true}
EOF
  chmod 600 "${OFFSITE_STATE_DIR}/tier-${tier}.json" 2>/dev/null || true
}

offsite_write_last_success() {
  local ts synced="${OFFSITE_SYNC_COUNT:-0}"
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat > "${OFFSITE_STATE_DIR}/last-success.json" <<EOF
{"timestamp":"${ts}","mode":"${OFFSITE_MODE}","host":"${OFFSITE_HOSTNAME}","path_prefix":"${OFFSITE_PATH_PREFIX}","synced":${synced}}
EOF
  rm -f "${OFFSITE_STATE_DIR}/last-failure.json" 2>/dev/null || true
  offsite_write_prometheus_metrics "${ts}" 1 0
}

offsite_write_prometheus_metrics() {
  local success_ts="${1:-$(date -u +%s)}"
  local verify_ok="${2:-0}"
  local failure_flag="${3:-0}"
  local unix_ts
  if [[ "${success_ts}" == *T* ]]; then
    unix_ts="$(date -u -d "${success_ts}" +%s 2>/dev/null || date +%s)"
  else
    unix_ts="${success_ts}"
  fi
  mkdir -p "$(dirname "${OFFSITE_PROM_TEXTFILE}")"
  local tmp="${OFFSITE_PROM_TEXTFILE}.$$"
  {
    if [[ -f "${OFFSITE_PROM_TEXTFILE}" ]]; then
      grep -v '^synqdrive_offsite_' "${OFFSITE_PROM_TEXTFILE}" || true
    fi
    cat <<EOF
# HELP synqdrive_offsite_last_success_timestamp Unix timestamp of last successful offsite sync
# TYPE synqdrive_offsite_last_success_timestamp gauge
synqdrive_offsite_last_success_timestamp ${unix_ts}
# HELP synqdrive_offsite_remote_verify_ok 1 when last offsite sync passed remote integrity checks
# TYPE synqdrive_offsite_remote_verify_ok gauge
synqdrive_offsite_remote_verify_ok ${verify_ok}
# HELP synqdrive_offsite_failure 1 when last offsite sync failed (see last-failure.json)
# TYPE synqdrive_offsite_failure gauge
synqdrive_offsite_failure ${failure_flag}
EOF
  } > "${tmp}"
  mv "${tmp}" "${OFFSITE_PROM_TEXTFILE}"
  chmod 644 "${OFFSITE_PROM_TEXTFILE}" 2>/dev/null || true
}

offsite_read_json_timestamp() {
  local file="$1"
  local key="${2:-timestamp}"
  [[ -f "${file}" ]] || return 1
  python3 - <<PY
import json, sys
try:
    with open("${file}") as f:
        data = json.load(f)
    print(data.get("${key}", ""))
except Exception:
    sys.exit(1)
PY
}

offsite_age_status() {
  local iso="$1"
  local ok_hours="${2:-26}"
  local stale_hours="${3:-48}"
  [[ -n "${iso}" ]] || { echo unknown; return; }
  local age_hours
  age_hours="$(python3 - <<PY
import datetime
try:
    ts = datetime.datetime.fromisoformat("${iso}".replace("Z", "+00:00"))
    age = (datetime.datetime.now(datetime.timezone.utc) - ts).total_seconds() / 3600
    print(int(age))
except Exception:
    print(-1)
PY
)"
  [[ "${age_hours}" -ge 0 ]] || { echo unknown; return; }
  if [[ "${age_hours}" -le "${ok_hours}" ]]; then echo ok
  elif [[ "${age_hours}" -le "${stale_hours}" ]]; then echo stale
  else echo failed
  fi
}

offsite_write_resilience_json() {
  local pg_state="/opt/synqdrive/shared/backups/postgresql/state/last-success.json"
  local ch_state="/opt/synqdrive/shared/backups/clickhouse/state/last-success.json"
  local redis_state="/opt/synqdrive/shared/backups/redis/state/last-success.json"
  local offsite_state="${OFFSITE_STATE_DIR}/last-success.json"
  local pg_restore="/opt/synqdrive/shared/backups/postgresql/state/last-restore-test.json"
  local ts now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ts="${now}"
  python3 - <<PY
import json, datetime, os

def read_ts(path, key="timestamp"):
    try:
        with open(path) as f:
            return json.load(f).get(key)
    except Exception:
        return None

def status_from_ts(ts, ok_h=26, stale_h=48):
    if not ts:
        return "unknown", None
    try:
        dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        age_h = (datetime.datetime.now(datetime.timezone.utc) - dt).total_seconds() / 3600
        iso = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        if age_h <= ok_h:
            return "ok", iso
        if age_h <= stale_h:
            return "stale", iso
        return "failed", iso
    except Exception:
        return "unknown", None

pg_ts = read_ts("${pg_state}")
ch_ts = read_ts("${ch_state}")
off_ts = read_ts("${offsite_state}")
restore_ts = read_ts("${pg_restore}")

pg_status, pg_iso = status_from_ts(pg_ts)
ch_status, ch_iso = status_from_ts(ch_ts)
off_status, off_iso = status_from_ts(off_ts)
restore_status, restore_iso = status_from_ts(restore_ts, ok_h=24*90, stale_h=24*120)

overall = "healthy"
for s in (pg_status, off_status):
    if s == "failed":
        overall = "critical"
        break
    if s in ("stale", "unknown") and overall == "healthy":
        overall = "warning"

doc = {
    "generatedAt": "${ts}",
    "overall": overall,
    "postgres": {"lastSuccessAt": pg_iso, "status": pg_status},
    "clickhouse": {"lastSuccessAt": ch_iso, "status": ch_status},
    "offsite": {"lastSyncAt": off_iso, "status": off_status},
    "restoreValidation": {"lastRunAt": restore_iso, "status": restore_status if restore_iso else "unknown"},
    "source": "offsite-backup-lib",
}
os.makedirs(os.path.dirname("${OFFSITE_RESILIENCE_JSON}"), exist_ok=True)
with open("${OFFSITE_RESILIENCE_JSON}", "w") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
os.chmod("${OFFSITE_RESILIENCE_JSON}", 0o600)
PY
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
