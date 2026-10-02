#!/usr/bin/env bash
# Remote bootstrap for S4F-7J Production Tiny config staging wrapper (no deploy / no migrations).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-mein-vps.internal}"
SSH_USER="$(cloud_agent_ssh_user)"
if [[ "${VPS_HOST}" == *"hstgr.cloud"* ]] && [[ "${SSH_USER}" == "root" ]]; then
  SSH_USER="synqdrive-admin"
fi
SSH_PORT="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
SSH_KEY="${HOME}/.ssh/id_ed25519"
GIT_REMOTE_URL="${CLOUD_AGENT_S4_TINY_STAGING_GIT_REMOTE_URL:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"

WRAPPER_SHA="${CLOUD_AGENT_S4_TINY_STAGING_TOOL_SHA:-}"
PRODUCTION_SHA="${DI_S4_TINY_STAGING_REQUIRED_SHA:-}"
PRODUCTION_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
DRY_RUN="${DRY_RUN:-0}"

echo "CLOUD_AGENT_REMOTE_BOOTSTRAP_PRESENT=YES"
echo "REMOTE_TOOL_SHA_PIN_REQUIRED=YES"
echo "PRODUCTION_RUNTIME_SHA_SEPARATELY_PINNED=YES"
echo "TEMP_CHECKOUT_ONLY=YES"
echo "PRODUCTION_RELEASE_MODIFIED=NO"
echo "WRAPPER_REQUIRES_NEW_CODE_DEPLOY_BEFORE_USE=NO"
echo "DRY_RUN_SUPPORTED=YES"

require_sha() {
  local label="$1" value="$2"
  if [[ -z "$value" ]]; then
    echo "[s4-tiny-staging-bootstrap] ERROR: ${label} is required." >&2
    exit 1
  fi
  if ! [[ "$value" =~ ^[0-9a-f]{40}$ ]]; then
    echo "[s4-tiny-staging-bootstrap] ERROR: ${label} must be a 40-char git SHA." >&2
    exit 1
  fi
}

ensure_ssh_key() {
  if [[ -f "$SSH_KEY" ]]; then
    return 0
  fi
  if ! cloud_agent_materialize_ssh_key "$SSH_KEY"; then
    echo "[s4-tiny-staging-bootstrap] ERROR: SSH key missing. Set CLOUD_AGENT_SSH_PRIVATE_KEY." >&2
    exit 1
  fi
  ssh-keyscan -H "$VPS_HOST" >> "${HOME}/.ssh/known_hosts" 2>/dev/null || true
}

require_sha "CLOUD_AGENT_S4_TINY_STAGING_TOOL_SHA" "$WRAPPER_SHA"
require_sha "DI_S4_TINY_STAGING_REQUIRED_SHA" "$PRODUCTION_SHA"
if [[ -z "$PRODUCTION_RELEASE_ID" ]]; then
  echo "[s4-tiny-staging-bootstrap] ERROR: DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID is required." >&2
  exit 1
fi

ensure_ssh_key

SSH_BASE=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -i "$SSH_KEY" -p "$SSH_PORT" "${SSH_USER}@${VPS_HOST}")

REMOTE_ENV=(
  "CLOUD_AGENT_S4_TINY_STAGING_TOOL_SHA=${WRAPPER_SHA}"
  "DI_S4_TINY_STAGING_REQUIRED_SHA=${PRODUCTION_SHA}"
  "DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID=${PRODUCTION_RELEASE_ID}"
  "DRY_RUN=${DRY_RUN}"
  "GIT_REMOTE_URL=${GIT_REMOTE_URL}"
)

for var in DI_S4_TINY_STAGING_ACK DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE SYNQDRIVE_BACKEND_ENV; do
  if [[ -n "${!var:-}" ]]; then
    REMOTE_ENV+=("${var}=${!var}")
  fi
done

REMOTE_SCRIPT=$(cat <<'EOS'
set -euo pipefail
WRAPPER_SHA="${CLOUD_AGENT_S4_TINY_STAGING_TOOL_SHA}"
PRODUCTION_SHA="${DI_S4_TINY_STAGING_REQUIRED_SHA}"
PRODUCTION_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID}"
GIT_REMOTE_URL="${GIT_REMOTE_URL}"
TEMP="$(mktemp -d /tmp/s4f7j-tiny-wrapper.XXXXXX)"
cleanup() { rm -rf "$TEMP"; }
trap cleanup EXIT

RELEASE_DIR="/opt/synqdrive/releases/${PRODUCTION_RELEASE_ID}"
if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "REMOTE_BOOTSTRAP_FAIL=RELEASE_DIR_MISSING"
  exit 1
fi
ACTUAL_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD 2>/dev/null || true)"
if [[ "$ACTUAL_SHA" != "$PRODUCTION_SHA" ]]; then
  echo "REMOTE_BOOTSTRAP_FAIL=PRODUCTION_SHA_MISMATCH"
  exit 1
fi

git init "$TEMP/repo" >/dev/null 2>&1
git -C "$TEMP/repo" remote add origin "$GIT_REMOTE_URL"
git -C "$TEMP/repo" fetch --depth 1 origin "$WRAPPER_SHA"
git -C "$TEMP/repo" checkout --detach FETCH_HEAD >/dev/null
CHECKED="$(git -C "$TEMP/repo" rev-parse HEAD)"
if [[ "$CHECKED" != "$WRAPPER_SHA" ]]; then
  echo "REMOTE_BOOTSTRAP_FAIL=WRAPPER_SHA_MISMATCH"
  exit 1
fi
echo "REMOTE_TOOL_SHA_VERIFIED=YES"

TOOL_BACKEND="$TEMP/repo/backend"
RELEASE_BACKEND="$RELEASE_DIR/backend"
if [[ ! -d "$RELEASE_BACKEND/node_modules" ]]; then
  echo "REMOTE_BOOTSTRAP_FAIL=RELEASE_NODE_MODULES_MISSING"
  exit 1
fi
ln -sfn "$RELEASE_BACKEND/node_modules" "$TOOL_BACKEND/node_modules"

export S4F7J_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export S4F4_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export S4F7F_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export SYNQDRIVE_CURRENT_LINK="/opt/synqdrive/current"
export SYNQDRIVE_BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
cd "$TOOL_BACKEND/scripts/ops"
if [[ -r "${SYNQDRIVE_BACKEND_ENV}" ]]; then
  exec bash ./di-v0-s4-stage-tiny-production.sh
fi
exec sudo -n -E bash ./di-v0-s4-stage-tiny-production.sh
EOS
)

echo "REMOTE_TOOL_SHA_PIN_REQUIRED=YES"
"${SSH_BASE[@]}" "${REMOTE_ENV[@]}" bash -s <<<"$REMOTE_SCRIPT"
