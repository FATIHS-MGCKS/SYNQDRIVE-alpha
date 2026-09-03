#!/usr/bin/env bash
# Enable Battery V2 full-fleet production activation (no canary/staged rollout).
# Sets BATTERY_V2_PUBLICATION_ENABLED=true and BATTERY_V2_REST_SHADOW_ENABLED=false.
# Uses rolling multi-replica restart with scheduler convergence gate.
#
# Run on VPS as root:
#   sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-enable-battery-v2-full-fleet-production.sh
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
RELEASE_OPS_DIR="${CURRENT}/backend/scripts/ops"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
cp "$BACKEND_ENV" "${BACKEND_ENV}.bak-battery-v2-m31-${STAMP}"
echo "Backup: ${BACKEND_ENV}.bak-battery-v2-m31-${STAMP}"

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  echo "${key}=${value}" >> "$tmp"
  mv "$tmp" "$file"
}

echo "=== BEFORE ==="
grep -E '^BATTERY_V2_(PUBLICATION|REST_SHADOW|RECONCILIATION)_' "$BACKEND_ENV" || true

upsert_env "$BACKEND_ENV" BATTERY_V2_PUBLICATION_ENABLED true
upsert_env "$BACKEND_ENV" BATTERY_V2_REST_SHADOW_ENABLED false
# RECONCILIATION_ENABLED: leave unset (code default true) unless explicitly present

chmod 600 "$BACKEND_ENV"

echo "=== AFTER (file) ==="
grep -E '^BATTERY_V2_(PUBLICATION|REST_SHADOW|RECONCILIATION)_' "$BACKEND_ENV" || true

TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD)"
export SYNQDRIVE_CURRENT_LINK="$CURRENT"
export SYNQDRIVE_EXTERNAL_HEALTH_URL="${SYNQDRIVE_EXTERNAL_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"

# shellcheck source=vps-production-replica-topology.config.sh
source "${RELEASE_OPS_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${RELEASE_OPS_DIR}/lib/vps-production-replica.lib.sh"

echo "=== Rolling restart (target SHA ${TARGET_SHA:0:12}) ==="
vps_replica_rolling_deploy "$CURRENT" "$TARGET_SHA"
vps_replica_verify_post_deploy "$CURRENT" "$TARGET_SHA"

echo "=== Effective PM2 config ==="
bash "${RELEASE_OPS_DIR}/battery-v2-m3-canary-observability.sh" config

ACTIVATION_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "BATTERY_V2_FULL_FLEET_T0=${ACTIVATION_TS}"
echo "Battery V2 full-fleet activation complete."
