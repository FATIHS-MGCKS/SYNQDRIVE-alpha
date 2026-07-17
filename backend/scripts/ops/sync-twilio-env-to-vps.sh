#!/usr/bin/env bash
# Sync Twilio Voice env vars to production VPS backend.env.
#
# Sources (first non-empty wins per var):
#   1. Current shell environment (Cursor Runtime Secrets)
#   2. Local backend/.env
#
# Usage (Cloud Agent with Twilio secrets):
#   bash backend/scripts/ops/sync-twilio-env-to-vps.sh
#
# Optional:
#   TWILIO_SYNC_VPS_HOST=srv1374778.hstgr.cloud
#   TWILIO_SYNC_SSH_USER=root
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_ENV="${ROOT}/.env"
REMOTE_ENV="/opt/synqdrive/shared/backend.env"
VPS_HOST="${TWILIO_SYNC_VPS_HOST:-${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}}"
SSH_USER="${TWILIO_SYNC_SSH_USER:-${CLOUD_AGENT_SSH_USER:-root}}"
VPS_HOST="${VPS_HOST//$'\r'/}"
VPS_HOST="${VPS_HOST//$'\n'/}"
VPS_HOST="${VPS_HOST//$'\t'/}"
VPS_HOST="${VPS_HOST#"${VPS_HOST%%[![:space:]]*}"}"
VPS_HOST="${VPS_HOST%"${VPS_HOST##*[![:space:]]}"}"
SSH_USER="${SSH_USER//$'\r'/}"
SSH_USER="${SSH_USER//$'\n'/}"
SSH_USER="${SSH_USER//$'\t'/}"
SSH_USER="${SSH_USER#"${SSH_USER%%[![:space:]]*}"}"
SSH_USER="${SSH_USER%"${SSH_USER##*[![:space:]]}"}"

read_var() {
  local name="$1"
  local default="${2:-}"
  local val="${!name:-}"
  if [[ -n "$val" ]]; then
    printf '%s' "$val"
    return
  fi
  if [[ -f "$LOCAL_ENV" ]]; then
    val="$(grep -E "^${name}=" "$LOCAL_ENV" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/')" || true
    if [[ -n "$val" ]]; then
      printf '%s' "$val"
      return
    fi
  fi
  printf '%s' "$default"
}

TWILIO_ACCOUNT_SID_VAL="$(read_var TWILIO_ACCOUNT_SID)"
TWILIO_API_KEY_SID_VAL="$(read_var TWILIO_API_KEY_SID)"
TWILIO_API_KEY_SECRET_VAL="$(read_var TWILIO_API_KEY_SECRET)"
TWILIO_AUTH_TOKEN_VAL="$(read_var TWILIO_AUTH_TOKEN)"
TWILIO_REGION_VAL="$(read_var TWILIO_REGION ie1)"
TWILIO_EDGE_VAL="$(read_var TWILIO_EDGE dublin)"
TWILIO_VOICE_WEBHOOK_BASE_URL_VAL="$(read_var TWILIO_VOICE_WEBHOOK_BASE_URL https://app.synqdrive.eu)"

missing=()
[[ -n "$TWILIO_ACCOUNT_SID_VAL" ]] || missing+=("TWILIO_ACCOUNT_SID")
[[ -n "$TWILIO_API_KEY_SID_VAL" ]] || missing+=("TWILIO_API_KEY_SID")
[[ -n "$TWILIO_API_KEY_SECRET_VAL" ]] || missing+=("TWILIO_API_KEY_SECRET")

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: Missing required Twilio vars: ${missing[*]}" >&2
  echo "Set Cursor Runtime Secrets or backend/.env, then retry." >&2
  exit 1
fi

BLOCK=$(
  cat <<EOF
# Twilio Voice PSTN — synced $(date -u +%Y-%m-%dT%H:%M:%SZ)
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID_VAL}
TWILIO_API_KEY_SID=${TWILIO_API_KEY_SID_VAL}
TWILIO_API_KEY_SECRET=${TWILIO_API_KEY_SECRET_VAL}
TWILIO_REGION=${TWILIO_REGION_VAL}
TWILIO_EDGE=${TWILIO_EDGE_VAL}
TWILIO_VOICE_WEBHOOK_BASE_URL=${TWILIO_VOICE_WEBHOOK_BASE_URL_VAL}
EOF
)

if [[ -n "$TWILIO_AUTH_TOKEN_VAL" ]]; then
  BLOCK="${BLOCK}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN_VAL}"
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP" "${TMP}.merged"' EXIT

ssh -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
  "grep -v -E '^(# Twilio Voice PSTN|TWILIO_ACCOUNT_SID=|TWILIO_API_KEY_SID=|TWILIO_API_KEY_SECRET=|TWILIO_AUTH_TOKEN=|TWILIO_REGION=|TWILIO_EDGE=|TWILIO_VOICE_WEBHOOK_BASE_URL=)' '$REMOTE_ENV' 2>/dev/null || true" > "$TMP"

{
  cat "$TMP"
  printf '%s\n' "$BLOCK"
} > "${TMP}.merged"

ssh -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
  "cp '$REMOTE_ENV' '${REMOTE_ENV}.bak-twilio-$(date -u +%Y%m%d%H%M%S)' && cat > '$REMOTE_ENV'" < "${TMP}.merged"

echo "Synced Twilio block to ${SSH_USER}@${VPS_HOST}:${REMOTE_ENV}"
echo "Keys set: TWILIO_ACCOUNT_SID TWILIO_API_KEY_SID TWILIO_API_KEY_SECRET TWILIO_REGION TWILIO_EDGE TWILIO_VOICE_WEBHOOK_BASE_URL"
if [[ -n "$TWILIO_AUTH_TOKEN_VAL" ]]; then
  echo "Also set: TWILIO_AUTH_TOKEN"
else
  echo "Note: TWILIO_AUTH_TOKEN not set — add Cursor Runtime Secret and re-run for webhook signature validation"
fi
