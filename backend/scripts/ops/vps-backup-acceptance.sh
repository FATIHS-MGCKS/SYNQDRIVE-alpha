#!/usr/bin/env bash
#
# vps-backup-acceptance.sh — Phase 2C.9 DR/backup acceptance validation.
#
# Modes:
#   --repo-only   Validate scripts, docs, selftests (CI / agent)
#   --vps         Validate production VPS state (cron, artifacts, state, metrics)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DOCS_DIR="${REPO_ROOT}/docs/remediation"
MODE="repo-only"
REPORT_DIR="${BACKUP_ACCEPTANCE_REPORT_DIR:-/opt/synqdrive/shared/backups/acceptance/reports}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
FAILURES=0
WARNINGS=0
CHECKS=()

record() {
  local status="$1" id="$2" msg="$3"
  CHECKS+=("${status}|${id}|${msg}")
  case "${status}" in
    PASS) printf '[PASS] %s: %s\n' "${id}" "${msg}" ;;
    WARN) printf '[WARN] %s: %s\n' "${id}" "${msg}"; WARNINGS=$((WARNINGS + 1)) ;;
    FAIL) printf '[FAIL] %s: %s\n' "${id}" "${msg}"; FAILURES=$((FAILURES + 1)) ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-only) MODE="repo-only"; shift ;;
    --vps) MODE="vps"; shift ;;
    -h|--help)
      echo "Usage: vps-backup-acceptance.sh [--repo-only|--vps]"
      exit 0
      ;;
    *) echo "unknown: $1" >&2; exit 2 ;;
  esac
done

# --- Repo checks (always) ---
REQUIRED_SCRIPTS=(
  vps-backup-database.sh
  vps-backup-clickhouse.sh
  vps-backup-redis.sh
  vps-backup-env-snapshot.sh
  vps-sync-offsite-backups.sh
  vps-verify-offsite-backups.sh
  vps-run-backup-job.sh
  vps-backup-automation-health.sh
  vps-install-backup-automation-cron.sh
  vps-restore-validation.sh
  vps-restore-test-postgresql.sh
  vps-restore-test-redis.sh
)
for s in "${REQUIRED_SCRIPTS[@]}"; do
  if [[ -f "${SCRIPT_DIR}/${s}" ]]; then
    record PASS "script.${s}" "present"
  else
    record FAIL "script.${s}" "missing"
  fi
done

REQUIRED_DOCS=(
  backup-automation.md
  offsite-backups.md
  restore-validation.md
  redis-backup.md
  disaster-recovery-production-readiness.md
)
for d in "${REQUIRED_DOCS[@]}"; do
  if [[ -f "${DOCS_DIR}/${d}" ]]; then
    record PASS "doc.${d}" "present"
  else
    record FAIL "doc.${d}" "missing"
  fi
done

SELFTESTS=(
  backup-automation.selftest.sh
  offsite-backup.selftest.sh
  redis-backup.selftest.sh
  restore-validation.selftest.sh
)
for t in "${SELFTESTS[@]}"; do
  if [[ -f "${SCRIPT_DIR}/${t}" ]]; then
    if bash "${SCRIPT_DIR}/${t}" >/dev/null 2>&1; then
      record PASS "selftest.${t}" "OK"
    else
      record FAIL "selftest.${t}" "failed"
    fi
  else
    record FAIL "selftest.${t}" "missing"
  fi
done

if grep -q 'synqdrive_backup_job_healthy' "${REPO_ROOT}/backend/monitoring/prometheus/alerts.yml" 2>/dev/null; then
  record PASS "monitoring.prometheus_alerts" "backup alert rules defined"
else
  record FAIL "monitoring.prometheus_alerts" "synqdrive_backups group missing"
fi

# --- VPS checks ---
if [[ "${MODE}" == "vps" ]]; then
  CRON_FILE="/etc/cron.d/synqdrive-backup-automation"
  if [[ -f "${CRON_FILE}" ]]; then
    record PASS "vps.cron_unified" "${CRON_FILE} installed"
  else
    record FAIL "vps.cron_unified" "${CRON_FILE} not found — run vps-install-backup-automation-cron.sh"
  fi

  STATE_DIR="/opt/synqdrive/shared/backups/automation/state"
  JOBS=(postgresql clickhouse redis env-snapshot offsite-sync offsite-verify)
  for job in "${JOBS[@]}"; do
    sf="${STATE_DIR}/${job}.json"
    if [[ ! -f "${sf}" ]]; then
      record FAIL "vps.state.${job}" "no state file — job never succeeded"
      continue
    fi
    result="$(JOB="${job}" STATE_FILE="${sf}" python3 - <<'PY'
import json, os, time, datetime, sys
s = json.loads(open(os.environ["STATE_FILE"]).read())
last_ok = s.get("last_success_at")
if not last_ok:
    print("no_success"); sys.exit(0)
dt = datetime.datetime.fromisoformat(last_ok.replace("Z", "+00:00"))
age_h = (time.time() - dt.timestamp()) / 3600
sla = 192 if os.environ["JOB"] == "offsite-verify" else 26
if age_h > sla:
    print(f"stale_{age_h:.0f}h")
elif s.get("last_failure_at") and (not last_ok or s["last_failure_at"] > last_ok):
    print("last_failed")
else:
    print("ok")
PY
)"
    case "${result}" in
      ok) record PASS "vps.state.${job}" "healthy" ;;
      no_success) record FAIL "vps.state.${job}" "never succeeded" ;;
      last_failed) record FAIL "vps.state.${job}" "last run failed" ;;
      stale_*) record FAIL "vps.state.${job}" "${result}" ;;
    esac
  done

  METRICS="/opt/synqdrive/shared/backups/automation/metrics.prom"
  [[ -f "${METRICS}" ]] && record PASS "vps.metrics" "metrics.prom exists" || record WARN "vps.metrics" "metrics.prom missing"

  OFFSITE_ENV="/opt/synqdrive/shared/offsite-backup.env"
  if [[ -f "${OFFSITE_ENV}" ]]; then
    record PASS "vps.offsite_config" "offsite-backup.env present"
  else
    record FAIL "vps.offsite_config" "offsite-backup.env missing"
  fi

  RV_REPORT="/opt/synqdrive/shared/backups/restore-validation/reports/latest-report.json"
  if [[ -f "${RV_REPORT}" ]]; then
    overall="$(python3 -c "import json; print(json.load(open('${RV_REPORT}'))['overall_success'])" 2>/dev/null || echo false)"
    if [[ "${overall}" == "True" ]]; then
      record PASS "vps.restore_validation" "latest drill overall_success=true"
    else
      record WARN "vps.restore_validation" "latest drill not fully successful"
    fi
  else
    record WARN "vps.restore_validation" "no restore-validation report on VPS"
  fi

  for tier in postgresql clickhouse redis env; do
    dir="/opt/synqdrive/shared/backups/${tier}/daily"
    count="$(find "${dir}" -maxdepth 1 -name '*.gpg' 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "${count}" -ge 2 ]]; then
      record PASS "vps.rotation.${tier}" "${count} generations (min 2)"
    elif [[ "${count}" -ge 1 ]]; then
      record WARN "vps.rotation.${tier}" "only ${count} generation"
    else
      record FAIL "vps.rotation.${tier}" "no encrypted artifacts"
    fi
  done

  UPLOADS_BACKUP="/opt/synqdrive/shared/backups/uploads/daily"
  DOCS_BACKUP="/opt/synqdrive/shared/backups/documents/daily"
  [[ -n "$(ls -A "${UPLOADS_BACKUP}" 2>/dev/null || true)" ]] && record PASS "vps.uploads_backup" "artifacts present" || record FAIL "vps.uploads_backup" "no backup tier (T0 gap)"
  [[ -n "$(ls -A "${DOCS_BACKUP}" 2>/dev/null || true)" ]] && record PASS "vps.documents_backup" "artifacts present" || record FAIL "vps.documents_backup" "no backup tier (T0 gap)"
fi

# --- Report ---
mkdir -p "${REPORT_DIR}" 2>/dev/null || REPORT_DIR="/tmp/synqdrive-acceptance"
REPORT="${REPORT_DIR}/backup-acceptance-${RUN_ID}.json"
CHECKS_FILE="$(mktemp)"
printf '%s\n' "${CHECKS[@]}" > "${CHECKS_FILE}"
MODE="${MODE}" FAILURES="${FAILURES}" WARNINGS="${WARNINGS}" RUN_ID="${RUN_ID}" \
  CHECKS_FILE="${CHECKS_FILE}" REPORT="${REPORT}" \
  python3 - <<'PY'
import json, os, datetime, pathlib

checks = []
for line in pathlib.Path(os.environ["CHECKS_FILE"]).read_text().splitlines():
    if not line.strip():
        continue
    status, cid, msg = line.split("|", 2)
    checks.append({"status": status, "id": cid, "message": msg})

failures = int(os.environ["FAILURES"])
mode = os.environ["MODE"]
# Repo-only cannot certify production; VPS with zero failures is necessary not sufficient
production_ready = False

report = {
    "run_id": os.environ["RUN_ID"],
    "mode": mode,
    "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "failures": failures,
    "warnings": int(os.environ["WARNINGS"]),
    "checks": checks,
    "production_ready": production_ready,
    "note": "See docs/remediation/disaster-recovery-production-readiness.md for authoritative verdict",
}
pathlib.Path(os.environ["REPORT"]).write_text(json.dumps(report, indent=2) + "\n")
PY
rm -f "${CHECKS_FILE}"

printf '\nAcceptance: failures=%s warnings=%s report=%s\n' "${FAILURES}" "${WARNINGS}" "${REPORT}"
[[ "${FAILURES}" -eq 0 ]] || exit 1
