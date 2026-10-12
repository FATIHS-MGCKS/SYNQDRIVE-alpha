#!/usr/bin/env bash
# Post-deploy monitoring failure exit code (immutable nonzero; not overridable to 0).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

# Returns the only supported exit code when replica deploy succeeded but monitoring refresh failed.
vps_deploy_monitoring_failure_exit_rc() {
  if [[ -n "${SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC:-}" ]]; then
    if [[ "${SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC}" == "0" ]]; then
      echo "WARN: SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC=0 is forbidden; using exit 4" >&2
    elif [[ "${SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC}" != "4" ]]; then
      echo "WARN: ignoring SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC=${SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC}; monitoring failure exit is fixed at 4" >&2
    fi
  fi
  printf '%s' "4"
}
