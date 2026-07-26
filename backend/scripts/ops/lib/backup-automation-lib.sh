#!/usr/bin/env bash
# SynqDrive — Backup automation library (Phase 2C.7).
# Retry, logging, exit codes, state, notifications.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# shellcheck disable=SC2034
BACKUP_AUTOMATION_LIB_VERSION="2c7.1"

# Standard exit codes
BACKUP_EXIT_OK=0
BACKUP_EXIT_FAIL=1
BACKUP_EXIT_CONFIG=2
BACKUP_EXIT_SKIPPED=3

backup_automation_defaults() {
  BACKUP_AUTOMATION_ENV_FILE="${BACKUP_AUTOMATION_ENV_FILE:-/opt/synqdrive/shared/backup-automation.env}"
  BACKUP_AUTOMATION_STATE_DIR="${BACKUP_AUTOMATION_STATE_DIR:-/opt/synqdrive/shared/backups/automation/state}"
  BACKUP_AUTOMATION_LOG_DIR="${BACKUP_AUTOMATION_LOG_DIR:-/var/log/synqdrive-backup}"
  BACKUP_AUTOMATION_METRICS_FILE="${BACKUP_AUTOMATION_METRICS_FILE:-/opt/synqdrive/shared/backups/automation/metrics.prom}"
  BACKUP_AUTOMATION_NOTIFY_EMAIL="${BACKUP_AUTOMATION_NOTIFY_EMAIL:-}"
  BACKUP_AUTOMATION_BACKEND_ENV="${BACKUP_AUTOMATION_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
  BACKUP_AUTOMATION_DEFAULT_RETRIES="${BACKUP_AUTOMATION_DEFAULT_RETRIES:-3}"
  BACKUP_AUTOMATION_DEFAULT_BACKOFF_SEC="${BACKUP_AUTOMATION_DEFAULT_BACKOFF_SEC:-120}"
  BACKUP_AUTOMATION_HOSTNAME="${BACKUP_AUTOMATION_HOSTNAME:-$(hostname -f 2>/dev/null || hostname)}"
  BACKUP_JOB_NAME="${BACKUP_JOB_NAME:-}"
  BACKUP_JOB_LOG_FILE="${BACKUP_JOB_LOG_FILE:-}"
}

backup_automation_load_env() {
  if [[ -f "${BACKUP_AUTOMATION_ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${BACKUP_AUTOMATION_ENV_FILE}"
    set +a
  fi
  if [[ -z "${BACKUP_AUTOMATION_NOTIFY_EMAIL}" && -f /opt/synqdrive/shared/offsite-backup.env ]]; then
    # shellcheck disable=SC1090
    source /opt/synqdrive/shared/offsite-backup.env
    BACKUP_AUTOMATION_NOTIFY_EMAIL="${OFFSITE_NOTIFY_EMAIL:-}"
  fi
}

backup_automation_ensure_dirs() {
  mkdir -p "${BACKUP_AUTOMATION_STATE_DIR}" "${BACKUP_AUTOMATION_LOG_DIR}"
  chmod 700 "${BACKUP_AUTOMATION_STATE_DIR}" 2>/dev/null || true
  mkdir -p "$(dirname "${BACKUP_AUTOMATION_METRICS_FILE}")"
}

backup_automation_log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)]"
  [[ -n "${BACKUP_JOB_NAME}" ]] && msg="${msg} [${BACKUP_JOB_NAME}]"
  msg="${msg} $*"
  printf '%s\n' "${msg}" >&2
  if [[ -n "${BACKUP_JOB_LOG_FILE}" ]]; then
    printf '%s\n' "${msg}" >> "${BACKUP_JOB_LOG_FILE}"
  fi
}

backup_automation_read_backend_var() {
  local key="$1"
  local default="${2:-}"
  if [[ ! -f "${BACKUP_AUTOMATION_BACKEND_ENV}" ]]; then
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
  done < "${BACKUP_AUTOMATION_BACKEND_ENV}"
  printf '%s' "${default}"
}

backup_automation_state_file() {
  local job="$1"
  printf '%s/%s.json' "${BACKUP_AUTOMATION_STATE_DIR}" "${job}"
}

backup_automation_now_ms() {
  date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))'
}

backup_automation_write_state() {
  local job="$1"
  local success="$2"
  local exit_code="$3"
  local duration_ms="$4"
  local error_msg="${5:-}"
  local state_file
  state_file="$(backup_automation_state_file "${job}")"
  JOB="${job}" SUCCESS="${success}" EXIT_CODE="${exit_code}" DURATION_MS="${duration_ms}" \
    ERROR_MSG="${error_msg}" STATE_FILE="${state_file}" HOST="${BACKUP_AUTOMATION_HOSTNAME}" \
    python3 - <<'PY'
import json, datetime, os, pathlib

path = pathlib.Path(os.environ["STATE_FILE"])
prev = {}
if path.exists():
    try:
        prev = json.loads(path.read_text())
    except Exception:
        prev = {}

now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
success = os.environ["SUCCESS"].lower() == "true"
consecutive = 0 if success else int(prev.get("consecutive_failures") or 0) + 1

state = {
    "job": os.environ["JOB"],
    "last_attempt_at": now,
    "last_exit_code": int(os.environ["EXIT_CODE"]),
    "last_duration_ms": int(os.environ["DURATION_MS"]),
    "last_error": os.environ.get("ERROR_MSG") or None,
    "consecutive_failures": consecutive,
    "host": os.environ["HOST"],
}
if success:
    state["last_success_at"] = now
    state["last_failure_at"] = prev.get("last_failure_at")
else:
    state["last_failure_at"] = now
    state["last_success_at"] = prev.get("last_success_at")

path.write_text(json.dumps(state, indent=2) + "\n")
path.chmod(0o600)
PY
}

backup_automation_notify_failure() {
  local job="$1"
  local subject="$2"
  local body="$3"
  backup_automation_log "ALERT: ${subject} — ${body}"
  if [[ -z "${BACKUP_AUTOMATION_NOTIFY_EMAIL}" ]]; then
    backup_automation_log "WARN: BACKUP_AUTOMATION_NOTIFY_EMAIL unset — alert log-only"
    return 0
  fi
  local api_key from
  api_key="$(backup_automation_read_backend_var RESEND_API_KEY)"
  from="$(backup_automation_read_backend_var EMAIL_DEFAULT_FROM "ops@synqdrive.eu")"
  if [[ -z "${api_key}" ]]; then
    backup_automation_log "WARN: RESEND_API_KEY missing — cannot email alert"
    return 0
  fi
  SUBJECT="${subject}" BODY="${body}" JOB="${job}" TO="${BACKUP_AUTOMATION_NOTIFY_EMAIL}" \
    FROM="${from}" API_KEY="${api_key}" HOST="${BACKUP_AUTOMATION_HOSTNAME}" \
    python3 - <<'PY'
import json, os, urllib.request
payload = {
  "from": os.environ["FROM"],
  "to": [os.environ["TO"]],
  "subject": os.environ["SUBJECT"],
  "text": os.environ["BODY"] + f"\n\nJob: {os.environ['JOB']}\nHost: {os.environ['HOST']}",
}
req = urllib.request.Request(
  "https://api.resend.com/emails",
  data=json.dumps(payload).encode(),
  headers={"Authorization": f"Bearer {os.environ['API_KEY']}", "Content-Type": "application/json"},
  method="POST",
)
try:
  with urllib.request.urlopen(req, timeout=30) as resp:
    print("notify:", resp.status)
except Exception as e:
    print("notify failed:", e)
PY
}

backup_automation_run_with_retry() {
  local job="$1"
  local script="$2"
  local retries="${3:-${BACKUP_AUTOMATION_DEFAULT_RETRIES}}"
  local backoff="${4:-${BACKUP_AUTOMATION_DEFAULT_BACKOFF_SEC}}"

  BACKUP_JOB_NAME="${job}"
  BACKUP_JOB_LOG_FILE="${BACKUP_AUTOMATION_LOG_DIR}/${job}.log"
  touch "${BACKUP_JOB_LOG_FILE}"
  chmod 640 "${BACKUP_JOB_LOG_FILE}" 2>/dev/null || true

  [[ -x "${script}" || -f "${script}" ]] || {
    backup_automation_log "ERROR: script not found: ${script}"
    backup_automation_write_state "${job}" false "${BACKUP_EXIT_CONFIG}" 0 "script not found: ${script}"
    backup_automation_notify_failure "${job}" "SynqDrive backup CONFIG ERROR: ${job}" "Script not found: ${script}"
    return "${BACKUP_EXIT_CONFIG}"
  }

  local attempt=1
  local start_ms last_err=""
  start_ms="$(backup_automation_now_ms)"

  while [[ "${attempt}" -le "${retries}" ]]; do
    backup_automation_log "attempt ${attempt}/${retries}: ${script}"
    set +e
    bash "${script}" >> "${BACKUP_JOB_LOG_FILE}" 2>&1
    local code=$?
    set -e
    if [[ "${code}" -eq 0 ]]; then
      local duration
      duration=$(( $(backup_automation_now_ms) - start_ms ))
      backup_automation_log "SUCCESS exit=0 duration_ms=${duration}"
      backup_automation_write_state "${job}" true 0 "${duration}" ""
      return 0
    fi
    last_err="exit ${code} on attempt ${attempt}"
    backup_automation_log "FAILED ${last_err}"
    if [[ "${attempt}" -lt "${retries}" ]]; then
      backup_automation_log "retry in ${backoff}s"
      sleep "${backoff}"
    fi
    attempt=$((attempt + 1))
  done

  local duration=$(( $(backup_automation_now_ms) - start_ms ))
  backup_automation_write_state "${job}" false 1 "${duration}" "${last_err}"
  backup_automation_notify_failure "${job}" \
    "SynqDrive backup FAILED: ${job}" \
    "All ${retries} attempt(s) failed. Last error: ${last_err}. Log: ${BACKUP_JOB_LOG_FILE}"
  return 1
}

backup_automation_job_sla_hours() {
  local job="$1"
  case "${job}" in
    postgresql|clickhouse|redis|env-snapshot|offsite-sync) echo 26 ;;
    offsite-verify) echo 192 ;;
    backup-health) echo 26 ;;
    *) echo 26 ;;
  esac
}

backup_automation_write_prometheus_metrics() {
  local jobs=("$@")
  local tmp="${BACKUP_AUTOMATION_METRICS_FILE}.tmp"
  {
    printf '# HELP synqdrive_backup_job_last_success_timestamp Unix timestamp of last successful backup job run\n'
    printf '# TYPE synqdrive_backup_job_last_success_timestamp gauge\n'
    printf '# HELP synqdrive_backup_job_healthy 1 if job within SLA and no recent failure\n'
    printf '# TYPE synqdrive_backup_job_healthy gauge\n'
    printf '# HELP synqdrive_backup_job_consecutive_failures Number of consecutive failed runs\n'
    printf '# TYPE synqdrive_backup_job_consecutive_failures gauge\n'
    local job state_file
    for job in "${jobs[@]}"; do
      state_file="$(backup_automation_state_file "${job}")"
      JOB="${job}" STATE_FILE="${state_file}" SLA_H="$(backup_automation_job_sla_hours "${job}")" \
        python3 - <<'PY'
import json, os, pathlib, time, datetime

job = os.environ["JOB"]
path = pathlib.Path(os.environ["STATE_FILE"])
sla_h = float(os.environ["SLA_H"])
healthy = 0
ts = 0
consecutive = 0
if path.exists():
    s = json.loads(path.read_text())
    consecutive = int(s.get("consecutive_failures") or 0)
    last_ok = s.get("last_success_at")
    last_fail = s.get("last_failure_at")
    if last_ok:
        dt = datetime.datetime.fromisoformat(last_ok.replace("Z", "+00:00"))
        ts = int(dt.timestamp())
        age_h = (time.time() - ts) / 3600
        if age_h <= sla_h and (not last_fail or last_fail <= last_ok):
            healthy = 1
print(f'synqdrive_backup_job_last_success_timestamp{{job="{job}"}} {ts}')
print(f'synqdrive_backup_job_healthy{{job="{job}"}} {healthy}')
print(f'synqdrive_backup_job_consecutive_failures{{job="{job}"}} {consecutive}')
PY
    done
  } > "${tmp}"
  mv "${tmp}" "${BACKUP_AUTOMATION_METRICS_FILE}"
  chmod 644 "${BACKUP_AUTOMATION_METRICS_FILE}" 2>/dev/null || true
}
