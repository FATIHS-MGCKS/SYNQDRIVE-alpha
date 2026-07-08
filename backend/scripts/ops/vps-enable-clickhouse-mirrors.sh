#!/usr/bin/env bash
# Enable ClickHouse analytics mirror flags on production VPS.
# Safe: mirrors are post-trip / best-effort — PostgreSQL remains canonical.
#
# Run on VPS:
#   bash /opt/synqdrive/current/backend/scripts/ops/vps-enable-clickhouse-mirrors.sh
#
# Or from Cloud Agent (SSH):
#   ssh root@srv1374778.hstgr.cloud 'bash -s' < backend/scripts/ops/vps-enable-clickhouse-mirrors.sh
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
PM2_APP="${PM2_APP:-synqdrive}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

if ! grep -q '^CLICKHOUSE_URL=' "$BACKEND_ENV"; then
  echo "ERROR: CLICKHOUSE_URL not set in $BACKEND_ENV — configure ClickHouse before enabling mirrors." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
cp "$BACKEND_ENV" "${BACKEND_ENV}.bak-mirrors-${STAMP}"
echo "Backup: ${BACKEND_ENV}.bak-mirrors-${STAMP}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

grep -v -E '^(HF_MIRROR_ENABLED|WAYPOINT_MIRROR_ENABLED|ACTIVITY_WINDOW_MIRROR_ENABLED|CLICKHOUSE_TRIP_ASSIST_ENABLED)=' \
  "$BACKEND_ENV" > "$TMP" || true

{
  cat "$TMP"
  echo ''
  echo '# ClickHouse analytics mirrors (V4.9.265+) — post-trip evidence only'
  echo 'HF_MIRROR_ENABLED=true'
  echo 'WAYPOINT_MIRROR_ENABLED=true'
  echo 'ACTIVITY_WINDOW_MIRROR_ENABLED=true'
  echo 'CLICKHOUSE_TRIP_ASSIST_ENABLED=true'
} > "$BACKEND_ENV"

chmod 600 "$BACKEND_ENV"

echo "Mirror flags set in $BACKEND_ENV:"
grep -E '^(HF_MIRROR|WAYPOINT_MIRROR|ACTIVITY_WINDOW|CLICKHOUSE_TRIP_ASSIST)' "$BACKEND_ENV"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
  echo "PM2 restarted: $PM2_APP"
else
  echo "WARN: pm2 not found — restart backend manually to pick up env changes."
fi
