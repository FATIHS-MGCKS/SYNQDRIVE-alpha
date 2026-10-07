#!/usr/bin/env bash
# EXP-021 S4F-7X — remote Production JIT fresh authority + DRY_RUN=1 (read-only / zero-write).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cloud-agent-ssh-common.sh
source "${SCRIPT_DIR}/cloud-agent-ssh-common.sh"

VPS_HOST="${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}"
SSH_USER="$(cloud_agent_ssh_user)"
if [[ "${VPS_HOST}" == *"hstgr.cloud"* ]] && [[ "${SSH_USER}" == "root" ]]; then
  SSH_USER="synqdrive-admin"
fi
SSH_PORT="${CLOUD_AGENT_VPS_SSH_PORT:-22}"
SSH_KEY="${HOME}/.ssh/id_ed25519"
GIT_REMOTE_URL="${CLOUD_AGENT_S4_TINY_STAGING_GIT_REMOTE_URL:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"

WRAPPER_SHA="${CLOUD_AGENT_S4F7X_TOOL_SHA:-${EXPECTED_FRESH_TINY_STAGING_TOOL_SHA:-11b4a80ccb88d1d6f747399f84667b06c9a71050}}"
PRODUCTION_SHA="${DI_S4_TINY_STAGING_REQUIRED_SHA:-}"
PRODUCTION_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
PRE_ENV_SHA="${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}"
DRY_RUN="${DRY_RUN:-1}"

ensure_ssh_key() {
  if [[ -f "$SSH_KEY" ]]; then
    return 0
  fi
  if cloud_agent_materialize_ssh_key "$SSH_KEY"; then
    ssh-keyscan -H "$VPS_HOST" >> "${HOME}/.ssh/known_hosts" 2>/dev/null || true
    return 0
  fi
  return 1
}

require_sha() {
  local label="$1" value="$2"
  if [[ -z "$value" ]] || ! [[ "$value" =~ ^[0-9a-f]{40}$ ]]; then
    echo "[s4f7x] ERROR: invalid ${label}" >&2
    exit 1
  fi
}

require_sha "TOOL_SHA" "$WRAPPER_SHA"
if [[ -z "$PRODUCTION_SHA" || -z "$PRODUCTION_RELEASE_ID" || -z "$PRE_ENV_SHA" ]]; then
  echo "[s4f7x] ERROR: set DI_S4_TINY_STAGING_REQUIRED_SHA, DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID, DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256" >&2
  exit 1
fi

ensure_ssh_key || {
  echo "[s4f7x] ERROR: SSH key missing" >&2
  exit 1
}

SSH_BASE=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -i "$SSH_KEY" -p "$SSH_PORT" "${SSH_USER}@${VPS_HOST}")

REMOTE_ENV=(
  "CLOUD_AGENT_S4F7X_TOOL_SHA=${WRAPPER_SHA}"
  "DI_S4_TINY_STAGING_REQUIRED_SHA=${PRODUCTION_SHA}"
  "DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID=${PRODUCTION_RELEASE_ID}"
  "DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256=${PRE_ENV_SHA}"
  "DI_S4_TINY_STAGING_ACK=YES"
  "DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE=KILLED"
  "DRY_RUN=${DRY_RUN}"
  "EXPECTED_FRESH_TINY_STAGING_TOOL_SHA=${WRAPPER_SHA}"
  "GIT_REMOTE_URL=${GIT_REMOTE_URL}"
  "SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env"
)

REMOTE_SCRIPT=$(cat <<'EOS'
set -euo pipefail
export CLOUD_AGENT_S4F7X_TOOL_SHA="${CLOUD_AGENT_S4F7X_TOOL_SHA:?}"
export DI_S4_TINY_STAGING_REQUIRED_SHA="${DI_S4_TINY_STAGING_REQUIRED_SHA:?}"
export DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:?}"
export DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256="${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:?}"
export DI_S4_TINY_STAGING_ACK="${DI_S4_TINY_STAGING_ACK:-}"
export DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE="${DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE:-KILLED}"
export DRY_RUN="${DRY_RUN:-1}"
export EXPECTED_FRESH_TINY_STAGING_TOOL_SHA="${EXPECTED_FRESH_TINY_STAGING_TOOL_SHA:?}"
export SYNQDRIVE_BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
export PM2_HOME="${PM2_HOME:-/root/.pm2}"
export SYNQDRIVE_CURRENT_LINK="/opt/synqdrive/current"

WRAPPER_SHA="${CLOUD_AGENT_S4F7X_TOOL_SHA}"
PRODUCTION_SHA="${DI_S4_TINY_STAGING_REQUIRED_SHA}"
PRODUCTION_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID}"
GIT_REMOTE_URL="${GIT_REMOTE_URL}"
TINY_VID="c10351f8-b6a2-4258-947f-631aeaa6d359"
TINY_ORG="faa710c9-6d91-4079-a7d5-91fdccdec14a"

echo "EXP021_S4F7X_REMOTE_BOOTSTRAP=1"
echo "SSH_CONNECTION=PASS"
echo "REMOTE_USER=$(whoami)"

RELEASE_DIR="/opt/synqdrive/releases/${PRODUCTION_RELEASE_ID}"
ACTUAL_SHA="$(git -C "$RELEASE_DIR" rev-parse HEAD 2>/dev/null || true)"
if [[ "$ACTUAL_SHA" != "$PRODUCTION_SHA" ]]; then
  echo "REMOTE_BOOTSTRAP_FAIL=PRODUCTION_SHA_MISMATCH"
  exit 1
fi
echo "REMOTE_PRODUCTION_SHA_VERIFIED=YES"

TEMP="$(mktemp -d /tmp/s4f7x-fresh-wrapper.XXXXXX)"
cleanup() { rm -rf "$TEMP"; }
trap cleanup EXIT

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
ln -sfn "$RELEASE_BACKEND/node_modules" "$TOOL_BACKEND/node_modules"

export S4F7V_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export S4F7J_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export S4F4_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"
export S4F7F_SCRIPT_DIR="$TOOL_BACKEND/scripts/ops"

CLI_REL="scripts/ops/di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-production-cli.ts"
run_cli() {
  (cd "$TOOL_BACKEND" && export DI_S4F7V_TOOL_CHECKOUT_SHA="$WRAPPER_SHA" && npx --yes ts-node --transpile-only "$CLI_REL" "$@")
}

FRESH_NB="$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT to_char((clock_timestamp() AT TIME ZONE 'UTC'), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');")"
echo "JIT_FRESH_NOT_BEFORE=${FRESH_NB}"

FUTURE_CNT="$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM vehicle_trips WHERE vehicle_id='${TINY_VID}' AND end_time IS NOT NULL AND end_time > clock_timestamp();")"
ELIG_CNT="$(sudo -n -u postgres psql -d synqdrive -Atqc "SELECT count(*)::text FROM vehicle_trips WHERE vehicle_id='${TINY_VID}' AND end_time IS NOT NULL AND end_time >= '${FRESH_NB}'::timestamptz;")"
echo "TINY_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT=${FUTURE_CNT}"
echo "FRESH_CUTOFF_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT=${ELIG_CNT}"
if [[ "$FUTURE_CNT" != "0" || "$ELIG_CNT" != "0" ]]; then
  echo "JIT_PRECONDITION_FAIL=YES"
  exit 1
fi

FP1="$(run_cli derive-fingerprint "$FRESH_NB" | awk -F= '/^INTERNALLY_COMPUTED_FINGERPRINT=/{print $2}')"
FP2="$(run_cli derive-fingerprint "$FRESH_NB" | awk -F= '/^INTERNALLY_COMPUTED_FINGERPRINT=/{print $2}')"
echo "FRESH_FINGERPRINT_DERIVE_1=${FP1}"
echo "FRESH_FINGERPRINT_DERIVE_2=${FP2}"
if [[ -z "$FP1" || "$FP1" != "$FP2" ]]; then
  echo "FRESH_FINGERPRINT_DERIVE_MISMATCH=YES"
  exit 1
fi
echo "FRESH_FINGERPRINT_DERIVE_STABLE=YES"

export DI_S4_TINY_FRESH_NOT_BEFORE="$FRESH_NB"
export DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT="$FP1"
export DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST="$TINY_ORG"
export DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST="$TINY_VID"

cd "$TOOL_BACKEND/scripts/ops"
exec bash ./di-v0-s4-stage-tiny-fresh-production.sh
EOS
)

echo "EXP021_S4F7X_LOCAL_DISPATCH=1"
"${SSH_BASE[@]}" "${REMOTE_ENV[@]}" sudo -n -E bash -s <<<"$REMOTE_SCRIPT"
