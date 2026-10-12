#!/usr/bin/env bash
# Fixed VPS entry for Cloud Agent production deploy — install only under /opt/synqdrive/shared/.
# Remote: sudo -n -H .../vo5c-cloud-agent-pinned-deploy-bootstrap.sh <REQUESTED_DEPLOY_SHA>
#         sudo -n -H .../vo5c-cloud-agent-pinned-deploy-bootstrap.sh --preflight-check
set -euo pipefail

BOOTSTRAP_SELF="$(readlink -f "${BASH_SOURCE[0]}")"
export VO5C_CLOUD_AGENT_BOOTSTRAP_SELF_PATH="$BOOTSTRAP_SELF"
SHARED_DIR="$(dirname "$BOOTSTRAP_SELF")"
VERIFY_LIB="${SHARED_DIR}/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh"
if [[ ! -f "$VERIFY_LIB" ]]; then
  VERIFY_LIB="/opt/synqdrive/shared/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh"
fi
# shellcheck source=lib/vo5c-cloud-agent-pinned-bootstrap-verify.lib.sh
source "$VERIFY_LIB"

if [[ "${1:-}" == "--preflight-check" ]]; then
  if ! vo5c_cloud_agent_bootstrap_preflight_only; then
    exit "${VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY}"
  fi
  exit 0
fi

if [[ $# -ne 1 ]]; then
  echo "ABORT: usage: $0 REQUESTED_DEPLOY_SHA" >&2
  exit 1
fi

REQUESTED_DEPLOY_SHA="$1"

if ! vo5c_cloud_agent_bootstrap_verify_shared_installation; then
  exit "${VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY}"
fi

if [[ ! -f /opt/synqdrive/shared/vo5c-pinned-executor.env ]]; then
  echo "ABORT: missing vo5c-pinned-executor.env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source /opt/synqdrive/shared/vo5c-pinned-executor.env
set +a

if ! vo5c_cloud_agent_bootstrap_verify_pinned_libraries "${SYNQDRIVE_PINNED_EXECUTOR_ROOT}" "${SYNQDRIVE_PINNED_EXECUTOR_SHA}"; then
  exit "${VO5C_CLOUD_AGENT_EXIT_BOOTSTRAP_INTEGRITY}"
fi

PINNED_IMPL="${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh"
# shellcheck source=lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh
source "$PINNED_IMPL"
vo5c_cloud_agent_bootstrap_main "$REQUESTED_DEPLOY_SHA"
