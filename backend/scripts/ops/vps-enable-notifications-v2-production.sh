#!/usr/bin/env bash
# Enable Notification Engine V2 globally on production VPS (full rollout — no org allowlist).
# External delivery remains controlled by NOTIFICATIONS_DELIVERY_ENABLED (default: false).
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-enable-notifications-v2-production.sh
#
# Or from Cloud Agent (SSH):
#   ssh root@srv1374778.hstgr.cloud 'bash -s' < backend/scripts/ops/vps-enable-notifications-v2-production.sh
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
FRONTEND_ENV="${FRONTEND_ENV:-/opt/synqdrive/shared/frontend.env}"
PM2_APP="${PM2_APP:-synqdrive}"
CURRENT="${CURRENT:-/opt/synqdrive/current}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi
if [[ ! -f "$FRONTEND_ENV" ]]; then
  echo "ERROR: $FRONTEND_ENV not found" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
cp "$BACKEND_ENV" "${BACKEND_ENV}.bak-notifications-v2-${STAMP}"
cp "$FRONTEND_ENV" "${FRONTEND_ENV}.bak-notifications-v2-${STAMP}"
echo "Backups:"
echo "  ${BACKEND_ENV}.bak-notifications-v2-${STAMP}"
echo "  ${FRONTEND_ENV}.bak-notifications-v2-${STAMP}"

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  echo "${key}=${value}" >> "$tmp"
  mv "$tmp" "$file"
}

remove_env_key() {
  local file="$1" key="$2"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  mv "$tmp" "$file"
}

upsert_env "$BACKEND_ENV" NOTIFICATIONS_V2 true
remove_env_key "$BACKEND_ENV" NOTIFICATIONS_V2_ORG_ALLOWLIST

upsert_env "$FRONTEND_ENV" VITE_NOTIFICATIONS_V2 on
remove_env_key "$FRONTEND_ENV" VITE_NOTIFICATIONS_V2_ORG_ALLOWLIST

chmod 600 "$BACKEND_ENV" "$FRONTEND_ENV"

echo "Notification V2 flags:"
grep -E '^(NOTIFICATIONS_V2|NOTIFICATIONS_DELIVERY|VITE_NOTIFICATIONS)' "$BACKEND_ENV" "$FRONTEND_ENV" || true

echo "Rebuilding frontend (VITE flags are build-time)..."
cd "$CURRENT/frontend"
set -a
# shellcheck disable=SC1090
source "$FRONTEND_ENV"
set +a
npm run build

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
  echo "PM2 restarted: $PM2_APP"
else
  echo "WARN: pm2 not found — restart backend manually."
fi

sleep 3
if curl -sf http://127.0.0.1:3001/api/v1/health >/dev/null; then
  echo "Health: ok"
else
  echo "WARN: local health check failed — verify manually."
  exit 1
fi

echo "Notification Engine V2 is globally enabled (no org allowlist)."
