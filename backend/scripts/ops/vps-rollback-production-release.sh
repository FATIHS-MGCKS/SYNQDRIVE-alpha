#!/usr/bin/env bash
# Roll back production to the release captured in the last deploy state file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

STATE_FILE="${1:-${SYNQDRIVE_DEPLOY_STATE_DIR}/last-deploy-state.env}"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "!! ABORT: deploy state file not found: ${STATE_FILE}" >&2
  echo "    Run a deploy first (vps-deploy-release.sh captures state) or pass explicit state path." >&2
  exit 1
fi

echo "==> Multi-replica production rollback"
echo "    state=${STATE_FILE}"

set +e
vps_replica_rollback "$STATE_FILE"
_RB_RC=$?
set -e

if [[ "$_RB_RC" -eq 0 ]]; then
  echo "==> Rollback PASS"
  exit 0
fi

if [[ -f "${SCRIPT_DIR}/lib/vps-release-attestation-integration.lib.sh" ]]; then
  # shellcheck source=lib/vps-release-attestation-integration.lib.sh
  source "${SCRIPT_DIR}/lib/vps-release-attestation-integration.lib.sh"
  if vps_p4b16_is_partial_success_rc "$_RB_RC"; then
    echo "==> Rollback PARTIAL_SUCCESS (exit ${_RB_RC}): replicas restored; P4B16 attestation reconciliation required" >&2
    exit "$_RB_RC"
  fi
elif [[ "$_RB_RC" -eq 3 ]]; then
  echo "==> Rollback PARTIAL_SUCCESS (exit 3): replicas restored; attestation reconciliation required" >&2
  exit 3
fi

echo "!! Rollback FAILED — manual intervention required" >&2
exit 1
