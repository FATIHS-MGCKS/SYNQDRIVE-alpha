#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_ENV="${ROOT}/.env"
REMOTE_ENV="/opt/synqdrive/shared/backend.env"
VPS_HOST="${STRIPE_SYNC_VPS_HOST:-srv1374778.hstgr.cloud}"
SSH_USER="${STRIPE_SYNC_SSH_USER:-root}"
SSH_KEY="${STRIPE_SYNC_SSH_KEY:-${HOME}/.ssh/id_ed25519}"

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "ERROR: $LOCAL_ENV not found" >&2
  exit 1
fi

STRIPE_LINES="$(grep -E '^(# Stripe|STRIPE_)' "$LOCAL_ENV" || true)"
if [[ -z "$STRIPE_LINES" ]]; then
  echo "ERROR: no STRIPE_* lines in $LOCAL_ENV" >&2
  exit 1
fi

if ! grep -q '^STRIPE_SECRET_KEY=.' <<<"$STRIPE_LINES"; then
  echo "ERROR: STRIPE_SECRET_KEY is empty in $LOCAL_ENV" >&2
  exit 1
fi

# Production portal return URL for VPS (test mode still uses sk_test_ key).
PORTAL_URL="${STRIPE_CUSTOMER_PORTAL_RETURN_URL:-https://app.synqdrive.eu}"
STRIPE_LINES="$(printf '%s\n' "$STRIPE_LINES" | grep -v '^STRIPE_CUSTOMER_PORTAL_RETURN_URL=' || true)"
STRIPE_LINES="${STRIPE_LINES}"$'\n'"STRIPE_CUSTOMER_PORTAL_RETURN_URL=${PORTAL_URL}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  ssh -i "$SSH_KEY" -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
    "grep -v -E '^(# Stripe|STRIPE_)' '$REMOTE_ENV' || true"
  printf '%s\n' "$STRIPE_LINES"
} > "$TMP"

ssh -i "$SSH_KEY" -o BatchMode=yes "${SSH_USER}@${VPS_HOST}" \
  "cp '$REMOTE_ENV' '${REMOTE_ENV}.bak-stripe-$(date -u +%Y%m%d%H%M%S)' && cat > '$REMOTE_ENV'" < "$TMP"

echo "Synced Stripe block from local backend/.env to ${SSH_USER}@${VPS_HOST}:${REMOTE_ENV}"
echo "Keys synced:"
printf '%s\n' "$STRIPE_LINES" | cut -d= -f1
echo "Run: ssh ${SSH_USER}@${VPS_HOST} 'pm2 restart synqdrive --update-env'"
