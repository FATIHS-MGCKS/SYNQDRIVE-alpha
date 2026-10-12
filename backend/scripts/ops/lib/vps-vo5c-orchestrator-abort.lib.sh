#!/usr/bin/env bash
# R2.7b — Central idempotent nginx abort/restore for VO5C webhook-safe orchestrator.
set -euo pipefail

VO5C_NGINX_MUTATION_BEGUN=0
VO5C_MAINTENANCE_RELOADED=0
VO5C_RESTORE_COMPLETED=0
VO5C_ABORT_IN_PROGRESS=0

# shellcheck source=vps-vo5c-nginx-restore.lib.sh
_ABORT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vps-vo5c-nginx-restore.lib.sh
source "${_ABORT_LIB_DIR}/vps-vo5c-nginx-restore.lib.sh"

vo5c_abort_record() {
  [[ -n "${VO5C_RESULT_FILE:-}" ]] && echo "$1" >>"$VO5C_RESULT_FILE"
}

vo5c_abort_init() {
  VO5C_NGINX_SITE="$1"
  VO5C_NGINX_BACKUP="$2"
  VO5C_RESULT_FILE="$3"
  VO5C_NGINX_MUTATION_BEGUN=0
  VO5C_MAINTENANCE_RELOADED=0
  VO5C_RESTORE_COMPLETED=0
  VO5C_ABORT_IN_PROGRESS=0
  trap vo5c_abort_on_exit EXIT
  trap 'vo5c_abort_on_signal INT' INT
  trap 'vo5c_abort_on_signal TERM' TERM
}

vo5c_abort_mark_nginx_mutation_begun() {
  VO5C_NGINX_MUTATION_BEGUN=1
}

vo5c_abort_mark_maintenance_reloaded() {
  VO5C_MAINTENANCE_RELOADED=1
}

vo5c_abort_mark_restore_completed() {
  VO5C_RESTORE_COMPLETED=1
  VO5C_MAINTENANCE_RELOADED=0
  VO5C_NGINX_MUTATION_BEGUN=0
}

vo5c_abort_disable_traps() {
  trap - EXIT INT TERM ERR
}

vo5c_abort_needs_restore() {
  [[ "$VO5C_RESTORE_COMPLETED" -eq 1 ]] && return 1
  [[ "$VO5C_NGINX_MUTATION_BEGUN" -eq 1 ]] && [[ -f "${VO5C_NGINX_BACKUP:-}" ]] && return 0
  return 1
}

# Idempotent golden restore; safe to call multiple times.
vo5c_abort_restore_idempotent() {
  if [[ "$VO5C_RESTORE_COMPLETED" -eq 1 ]]; then
    return 0
  fi
  if ! vo5c_abort_needs_restore; then
    return 0
  fi
  if [[ "$VO5C_ABORT_IN_PROGRESS" -eq 1 ]]; then
    return 1
  fi
  VO5C_ABORT_IN_PROGRESS=1
  if vo5c_nginx_restore_from_backup "${VO5C_NGINX_BACKUP}" "${VO5C_NGINX_SITE}"; then
    if vo5c_nginx_verify_restored_site "${VO5C_NGINX_BACKUP}" "${VO5C_NGINX_SITE}"; then
      vo5c_abort_record "PUBLIC_TRAFFIC_RESTORED=YES"
      vo5c_abort_mark_restore_completed
      VO5C_ABORT_IN_PROGRESS=0
      return 0
    fi
  fi
  vo5c_abort_record "PUBLIC_TRAFFIC_RESTORED=FAILED"
  vo5c_abort_record "PRODUCTION_RELEASE_VERDICT=BLOCKED"
  vo5c_abort_record "CRITICAL_ERRORS=nginx_restore_failed"
  VO5C_ABORT_IN_PROGRESS=0
  return 1
}

vo5c_abort_fail() {
  local reason="$*"
  echo "!! ORCHESTRATOR_ABORT: ${reason}"
  vo5c_abort_record "PRODUCTION_RELEASE_VERDICT=BLOCKED"
  vo5c_abort_record "CRITICAL_ERRORS=${reason}"
  vo5c_abort_restore_idempotent || true
  vo5c_abort_disable_traps
  exit 1
}

vo5c_abort_on_signal() {
  local sig=$1
  local code=130
  [[ "$sig" == "TERM" ]] && code=143
  vo5c_abort_record "ORCHESTRATOR_SIGNAL=${sig}"
  vo5c_abort_restore_idempotent || true
  vo5c_abort_disable_traps
  exit "$code"
}

vo5c_abort_on_exit() {
  local ec=$?
  if [[ "$VO5C_ABORT_IN_PROGRESS" -eq 1 ]]; then
    exit "$ec"
  fi
  if [[ "$ec" -ne 0 ]] && vo5c_abort_needs_restore; then
    vo5c_abort_restore_idempotent || true
  fi
  vo5c_abort_disable_traps
  exit "$ec"
}
