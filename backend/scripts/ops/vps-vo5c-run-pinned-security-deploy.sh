#!/usr/bin/env bash
# VO5C — invoke pinned R2 deploy executor after preflight (does not auto-authorize deploy).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED:-0}" != "1" ]]; then
  echo "!! ABORT: SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED=1 required (human release authorization)" >&2
  exit 1
fi

bash "${SCRIPT_DIR}/vps-vo5c-first-security-deploy-preflight.sh"

PINNED_EXECUTOR_ROOT="${SYNQDRIVE_PINNED_EXECUTOR_ROOT:?}"
PINNED_DEPLOY_SCRIPT="${PINNED_EXECUTOR_ROOT}/backend/scripts/ops/vps-deploy-release.sh"
if [[ ! -f "$PINNED_DEPLOY_SCRIPT" ]]; then
  echo "!! ABORT: pinned deploy executor missing: ${PINNED_DEPLOY_SCRIPT}" >&2
  exit 1
fi
# Never delegate to the legacy production-current executor — only the verified pinned R2 tree.
export SYNQDRIVE_VO5C_PINNED_EXECUTOR_INVOKE=1
exec "$PINNED_DEPLOY_SCRIPT" "$@"
