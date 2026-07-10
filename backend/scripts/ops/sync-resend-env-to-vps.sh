#!/usr/bin/env bash
# Sync Resend / outbound-email env vars to production VPS backend.env.
#
# Sources (first non-empty wins per var):
#   1. Current shell environment (Cursor Runtime Secret RESEND_API_KEY)
#   2. Local backend/.env
#
# Usage (Cloud Agent with RESEND_API_KEY secret):
#   bash backend/scripts/ops/sync-resend-env-to-vps.sh
#
# Optional:
#   RESEND_SYNC_VPS_HOST=srv1374778.hstgr.cloud
#   RESEND_SYNC_SSH_USER=root
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_ENV="${ROOT}/.env"
REMOTE_ENV="/opt/synqdrive/shared/backend.env"
VPS_HOST="${RESEND_SYNC_VPS_HOST:-${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud}}"
SSH_USER="${RESEND_SYNC_SSH_USER:-${CLOUD_AGENT_SSH_USER:-root}}"

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

RESEND_API_KEY_VAL="$(read_var RESEND_API_KEY)"
if [[ -z "$RESEND_API_KEY_VAL" ]]; then
  echo "ERROR: RESEND_API_KEY not set (Cursor Secret or backend/.env)" >&2
  exit 1
fi

EMAIL_PROVIDER_VAL="$(read_var EMAIL_PROVIDER resend)"
EMAIL_SIMULATE_VAL="$(read_var EMAIL_SIMULATE_ENABLED false)"
EMAIL_DEFAULT_FROM_VAL="$(read_var EMAIL_DEFAULT_FROM noreply@synqdrive.eu)"
EMAIL_DEFAULT_FROM_NAME_VAL="$(read_var EMAIL_DEFAULT_FROM_NAME SynqDrive)"
EMAIL_DEFAULT_REPLY_TO_VAL="$(read_var EMAIL_DEFAULT_REPLY_TO info@synqdrive.eu)"
RESEND_WEBHOOK_SECRET_VAL="$(read_var RESEND_WEBHOOK_SECRET)"

BLOCK=$(
  cat <<EOF
# Outbound email (Resend) — synced $(date -u +%Y-%m-%dT%H:%M:%SZ)
EMAIL_PROVIDER=${EMAIL_PROVIDER_VAL}
EMAIL_SIMULATE_ENABLED=${EMAIL_SIMULATE_VAL}
RESEND_API_KEY=${RESEND_API_KEY_VAL}
EMAIL_DEFAULT_FROM=${EMAIL_DEFAULT_FROM_VAL}
EMAIL_DEFAULT_FROM_NAME=${EMAIL_DEFAULT_FROM_NAME_VAL}
EMAIL_DEFAULT_REPLY_TO=${EMAIL_DEFAULT_REPLY_TO_VAL}
EOF
)
if [[ -n "$RESEND_WEBHOOK_SECRET_VAL" ]]; then
  BLOCK="${BLOCK}
RESEND_WEBHOOK_SECRET=${RESEND_WEBHOOK_SECRET_VAL}"
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

ssh -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
  "grep -v -E '^(# Outbound email \\(Resend\\)|EMAIL_PROVIDER=|EMAIL_SIMULATE_ENABLED=|RESEND_API_KEY=|EMAIL_DEFAULT_FROM=|EMAIL_DEFAULT_FROM_NAME=|EMAIL_DEFAULT_REPLY_TO=|RESEND_WEBHOOK_SECRET=)' '$REMOTE_ENV' 2>/dev/null || true" > "$TMP"

{
  cat "$TMP"
  printf '%s\n' "$BLOCK"
} > "${TMP}.merged"

ssh -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
  "cp '$REMOTE_ENV' '${REMOTE_ENV}.bak-resend-$(date -u +%Y%m%d%H%M%S)' && cat > '$REMOTE_ENV'" < "${TMP}.merged"

echo "Synced Resend email block to ${SSH_USER}@${VPS_HOST}:${REMOTE_ENV}"
echo "Keys set: EMAIL_PROVIDER EMAIL_SIMULATE_ENABLED RESEND_API_KEY EMAIL_DEFAULT_FROM EMAIL_DEFAULT_FROM_NAME EMAIL_DEFAULT_REPLY_TO"
if [[ -n "$RESEND_WEBHOOK_SECRET_VAL" ]]; then
  echo "Also set: RESEND_WEBHOOK_SECRET"
else
  echo "Note: RESEND_WEBHOOK_SECRET not set — add later for delivery webhooks"
fi
