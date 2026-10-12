#!/usr/bin/env bash
# Fixed VPS entry for Cloud Agent production deploy — install only under /opt/synqdrive/shared/.
# Invoked remotely with exactly one argument: REQUESTED_DEPLOY_SHA (40-char hex).
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "ABORT: usage: $0 REQUESTED_DEPLOY_SHA" >&2
  exit 1
fi

REQUESTED_DEPLOY_SHA="$1"
BOOTSTRAP_SELF="$(readlink -f "${BASH_SOURCE[0]}")"
export VO5C_CLOUD_AGENT_BOOTSTRAP_SELF_PATH="$BOOTSTRAP_SELF"

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMPL_LIB="${OPS_DIR}/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh"

# When installed on VPS, implementation is loaded from the pinned executor tree (hash-bound).
if [[ -f /opt/synqdrive/shared/vo5c-pinned-executor.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /opt/synqdrive/shared/vo5c-pinned-executor.env
  set +a
  PINNED_IMPL="${SYNQDRIVE_PINNED_EXECUTOR_ROOT}/backend/scripts/ops/lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh"
  if [[ -f "$PINNED_IMPL" ]]; then
    IMPL_LIB="$PINNED_IMPL"
  fi
fi

# shellcheck source=lib/vo5c-cloud-agent-pinned-bootstrap.lib.sh
source "$IMPL_LIB"
vo5c_cloud_agent_bootstrap_main "$REQUESTED_DEPLOY_SHA"
