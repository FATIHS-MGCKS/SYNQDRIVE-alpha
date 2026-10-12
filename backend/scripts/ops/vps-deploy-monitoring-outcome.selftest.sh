#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/vps-deploy-monitoring-outcome.lib.sh
source "${ROOT}/lib/vps-deploy-monitoring-outcome.lib.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

rc="$(vps_deploy_monitoring_failure_exit_rc)"
[[ "$rc" == "4" ]] && pass default_exit_4

export SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC=0
rc="$(vps_deploy_monitoring_failure_exit_rc 2>/dev/null)"
[[ "$rc" == "4" ]] && pass zero_override_forbidden

export SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC=9
rc="$(vps_deploy_monitoring_failure_exit_rc 2>/dev/null)"
[[ "$rc" == "4" ]] && pass nonzero_nonfour_ignored

unset SYNQDRIVE_DEPLOY_MONITORING_FAIL_RC
[[ "$(vps_deploy_monitoring_failure_exit_rc)" == "4" ]] && pass unset_still_four

echo "ALL_MONITORING_OUTCOME_TESTS_PASS"
