#!/usr/bin/env bash
#
# backup-automation.selftest.sh — Retry, state, health, exit codes.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "${ROOT}"' EXIT

# shellcheck source=lib/backup-automation-lib.sh
source "${SCRIPT_DIR}/lib/backup-automation-lib.sh"

export BACKUP_AUTOMATION_STATE_DIR="${ROOT}/state"
export BACKUP_AUTOMATION_LOG_DIR="${ROOT}/logs"
export BACKUP_AUTOMATION_METRICS_FILE="${ROOT}/metrics.prom"
export BACKUP_AUTOMATION_DEFAULT_RETRIES=2
export BACKUP_AUTOMATION_DEFAULT_BACKOFF_SEC=1
export BACKUP_AUTOMATION_NOTIFY_EMAIL=""

backup_automation_defaults
backup_automation_ensure_dirs

OK_SCRIPT="${ROOT}/ok.sh"
FAIL_SCRIPT="${ROOT}/fail.sh"
FLaky_SCRIPT="${ROOT}/flaky.sh"
echo '#!/bin/bash' > "${OK_SCRIPT}"; echo 'exit 0' >> "${OK_SCRIPT}"
echo '#!/bin/bash' > "${FAIL_SCRIPT}"; echo 'exit 1' >> "${FAIL_SCRIPT}"
cat > "${FLaky_SCRIPT}" <<EOF
#!/bin/bash
F="${ROOT}/flaky.count"
c=0
[[ -f "\$F" ]] && c=\$(cat "\$F")
c=\$((c+1))
echo \$c > "\$F"
[[ \$c -ge 2 ]] && exit 0 || exit 1
EOF
chmod +x "${OK_SCRIPT}" "${FAIL_SCRIPT}" "${FLaky_SCRIPT}"

backup_automation_run_with_retry "test-ok" "${OK_SCRIPT}" 1 1
backup_automation_run_with_retry "test-flaky" "${FLaky_SCRIPT}" 3 1
if backup_automation_run_with_retry "test-fail" "${FAIL_SCRIPT}" 2 1; then
  echo "FAIL expected test-fail to fail"
  exit 1
fi

JOBS=(test-ok test-flaky test-fail postgresql)
backup_automation_write_prometheus_metrics "${JOBS[@]}"
[[ -f "${BACKUP_AUTOMATION_METRICS_FILE}" ]] || { echo "FAIL metrics"; exit 1; }
grep -q 'synqdrive_backup_job_healthy' "${BACKUP_AUTOMATION_METRICS_FILE}" || { echo "FAIL metric content"; exit 1; }

bash "${SCRIPT_DIR}/vps-run-backup-job.sh" --job "cli-ok" --script "${OK_SCRIPT}" --retries 1 --backoff 1

echo "backup-automation selftest: OK"
