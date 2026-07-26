#!/usr/bin/env bash
#
# vps-backup-automation-health.sh — Backup SLA watchdog + Prometheus metrics.
# Exit 1 when any job is unhealthy (for cron/monitoring).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/backup-automation-lib.sh
source "${SCRIPT_DIR}/lib/backup-automation-lib.sh"

backup_automation_defaults
backup_automation_load_env
backup_automation_defaults
backup_automation_ensure_dirs

JOBS=(postgresql clickhouse redis env-snapshot offsite-sync offsite-verify)
FAILURES=0
UNHEALTHY=()

for job in "${JOBS[@]}"; do
  state_file="$(backup_automation_state_file "${job}")"
  if [[ ! -f "${state_file}" ]]; then
    backup_automation_log "UNHEALTHY ${job}: no state file (never run?)"
    UNHEALTHY+=("${job}:never_run")
    FAILURES=$((FAILURES + 1))
    continue
  fi
  result="$(JOB="${job}" STATE_FILE="${state_file}" SLA_H="$(backup_automation_job_sla_hours "${job}")" python3 - <<'PY'
import json, os, pathlib, time, datetime, sys

job = os.environ["JOB"]
path = pathlib.Path(os.environ["STATE_FILE"])
sla_h = float(os.environ["SLA_H"])
s = json.loads(path.read_text())
last_ok = s.get("last_success_at")
last_fail = s.get("last_failure_at")
consecutive = int(s.get("consecutive_failures") or 0)
reasons = []
if not last_ok:
    reasons.append("no_success")
else:
    dt = datetime.datetime.fromisoformat(last_ok.replace("Z", "+00:00"))
    age_h = (time.time() - dt.timestamp()) / 3600
    if age_h > sla_h:
        reasons.append(f"stale_{age_h:.1f}h")
if last_fail and (not last_ok or last_fail > last_ok):
    reasons.append("last_run_failed")
if consecutive > 0:
    reasons.append(f"consecutive_{consecutive}")
if reasons:
    print("unhealthy:" + ",".join(reasons))
    sys.exit(1)
print("healthy")
PY
)"
  if [[ "${result}" == healthy ]]; then
    backup_automation_log "OK ${job}"
  else
    backup_automation_log "UNHEALTHY ${job}: ${result#unhealthy:}"
    UNHEALTHY+=("${job}:${result#unhealthy:}")
    FAILURES=$((FAILURES + 1))
  fi
done

backup_automation_write_prometheus_metrics "${JOBS[@]}"
backup_automation_write_state "backup-health" "$([[ "${FAILURES}" -eq 0 ]] && echo true || echo false)" \
  "$([[ "${FAILURES}" -eq 0 ]] && echo 0 || echo 1)" 0 \
  "$([[ "${FAILURES}" -eq 0 ]] && echo "" || echo "${UNHEALTHY[*]}")"

if [[ "${FAILURES}" -gt 0 ]]; then
  backup_automation_notify_failure "backup-health" \
    "SynqDrive backup health check FAILED" \
    "Unhealthy jobs: ${UNHEALTHY[*]}. Metrics: ${BACKUP_AUTOMATION_METRICS_FILE}"
  exit 1
fi

backup_automation_log "backup health SUCCESS"
exit 0
