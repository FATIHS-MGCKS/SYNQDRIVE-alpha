#!/usr/bin/env bash
# Enable Battery V2 Stage-2 corrected production activation.
# Stage-2 contract: REST_SHADOW=true + PUBLICATION=true + RECONCILIATION=true
#
# Run on VPS as root:
#   sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-enable-battery-v2-stage2-production.sh
#
# Dry-run (no mutations):
#   sudo DRY_RUN=1 bash .../vps-enable-battery-v2-stage2-production.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/battery-v2-stage2-cutover.lib.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover.lib.sh"

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
RELEASE_OPS_DIR="${CURRENT}/backend/scripts/ops"
DRY_RUN="${DRY_RUN:-0}"
REQUIRE_PREFLIGHT_ACK="${BATTERY_V2_STAGE2_REQUIRE_PREFLIGHT_ACK:-1}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

TARGET_REST_SHADOW=true
TARGET_PUBLICATION=true
TARGET_RECONCILIATION=true

battery_v2_stage2_contract_reject_invalid "$TARGET_REST_SHADOW" "$TARGET_PUBLICATION" || exit 1
if ! battery_v2_stage2_contract_is_valid "$TARGET_REST_SHADOW" "$TARGET_PUBLICATION" "$TARGET_RECONCILIATION"; then
  echo "ERROR: internal Stage-2 target contract invalid" >&2
  exit 1
fi

echo "=== Battery V2 Stage-2 activation preflight ==="
bash "${SCRIPT_DIR}/battery-v2-stage2-production-preflight.sh"

if [[ "$REQUIRE_PREFLIGHT_ACK" == "1" && "${BATTERY_V2_STAGE2_PREFLIGHT_ACK:-}" != "YES" ]]; then
  echo "ERROR: set BATTERY_V2_STAGE2_PREFLIGHT_ACK=YES after reviewing preflight output" >&2
  exit 1
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — would set REST_SHADOW=true PUBLICATION=true (reconciliation default true)"
  echo "No backend.env changes applied."
  exit 0
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
cp "$BACKEND_ENV" "${BACKEND_ENV}.bak-battery-v2-stage2-${STAMP}"
echo "Backup: ${BACKEND_ENV}.bak-battery-v2-stage2-${STAMP}"

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

CURRENT_REST_SHADOW="$(grep -E '^BATTERY_V2_REST_SHADOW_ENABLED=' "$BACKEND_ENV" | tail -n1 | cut -d= -f2- || echo false)"
CURRENT_PUBLICATION="$(grep -E '^BATTERY_V2_PUBLICATION_ENABLED=' "$BACKEND_ENV" | tail -n1 | cut -d= -f2- || echo false)"
if battery_v2_invalid_m31_contract_is_active "$CURRENT_REST_SHADOW" "$CURRENT_PUBLICATION"; then
  echo "NOTE: correcting invalid M3.1 contract (REST_SHADOW=false + PUBLICATION=true)"
fi

upsert_env "$BACKEND_ENV" BATTERY_V2_REST_SHADOW_ENABLED true
upsert_env "$BACKEND_ENV" BATTERY_V2_PUBLICATION_ENABLED true
upsert_env "$BACKEND_ENV" BATTERY_V2_RECONCILIATION_ENABLED true
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
echo "BATTERY_V2_STAGE2_T0=${ACTIVATION_TS}"
echo "Battery V2 Stage-2 corrected activation complete."
