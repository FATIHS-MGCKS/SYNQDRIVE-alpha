#!/usr/bin/env bash
# Runs on VPS (stdin via SSH). Arguments: REQUESTED_SHA PIN_ENV SESSION_FILE [STAGED_ROOT]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_ROOT="${REMOTE_LIB_DIR:-${SCRIPT_DIR}/lib}"
# shellcheck source=lib/cloud-agent-vo5c-remote-pinned-deploy.lib.sh
source "${LIB_ROOT}/cloud-agent-vo5c-remote-pinned-deploy.lib.sh"

REQUESTED_SHA="${1:-}"
PIN_ENV="${2:-}"
SESSION_FILE="${3:-}"
STAGED_ROOT="${4:-${SYNQDRIVE_STAGED_RELEASE_ROOT:-}}"

cloud_agent_vo5c_run_remote_pinned_deploy "$REQUESTED_SHA" "$PIN_ENV" "$SESSION_FILE" \
  "/opt/synqdrive/shared/vo5c-production-deploy-authority.env" \
  "/opt/synqdrive/shared/vo5c-production-deploy-enforcement-armed" \
  "$STAGED_ROOT"
