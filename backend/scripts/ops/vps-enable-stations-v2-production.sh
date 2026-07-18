#!/usr/bin/env bash
# Enable Stations V2 globally on production VPS (full rollout — no org allowlist / canary).
# Booking rules: enforce (not shadow/warning). Legacy SET /vehicles hard-disabled.
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-enable-stations-v2-production.sh
#
# Or from Cloud Agent (SSH):
#   ssh root@srv1374778.hstgr.cloud 'bash -s' < backend/scripts/ops/vps-enable-stations-v2-production.sh
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
PM2_APP="${PM2_APP:-synqdrive}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
cp "$BACKEND_ENV" "${BACKEND_ENV}.bak-stations-v2-${STAMP}"
echo "Backup: ${BACKEND_ENV}.bak-stations-v2-${STAMP}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

grep -v -E '^(STATIONS_V2_[A-Z0-9_]+)=' "$BACKEND_ENV" > "$TMP" || true

{
  cat "$TMP"
  echo ''
  echo '# Stations V2 — global production rollout (no org allowlist / canary)'
  echo 'STATIONS_V2_SCHEMA_ENABLED=true'
  echo 'STATIONS_V2_SCOPE_ENABLED=true'
  echo 'STATIONS_V2_LIFECYCLE_ENABLED=true'
  echo 'STATIONS_V2_SUMMARY_READ_MODEL_ENABLED=true'
  echo 'STATIONS_V2_DELTA_ASSIGNMENT_ENABLED=true'
  echo 'STATIONS_V2_POSITIONING_ENABLED=true'
  echo 'STATIONS_V2_BOOKING_RULES_ENABLED=true'
  echo 'STATIONS_V2_BOOKING_RULES_ENFORCEMENT=enforce'
  echo 'STATIONS_V2_CAPACITY_WARNINGS_ENABLED=true'
  echo 'STATIONS_V2_TRANSFERS_ENABLED=true'
  echo 'STATIONS_V2_AUDIT_TRAIL_ENABLED=true'
  echo 'STATIONS_V2_GEOFENCE_SHADOW_ENABLED=true'
  echo 'STATIONS_V2_UI_ENABLED=true'
  echo 'STATIONS_V2_SET_VEHICLES_DISABLED=true'
} > "$BACKEND_ENV"

chmod 600 "$BACKEND_ENV"

echo "Stations V2 flags set in $BACKEND_ENV:"
grep -E '^STATIONS_V2_' "$BACKEND_ENV"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
  echo "PM2 restarted: $PM2_APP"
else
  echo "WARN: pm2 not found — restart backend manually to pick up env changes."
fi
