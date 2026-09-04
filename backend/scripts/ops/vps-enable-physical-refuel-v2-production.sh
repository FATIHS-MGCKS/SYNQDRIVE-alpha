#!/usr/bin/env bash
# Enable Physical Refuel V2 reconciliation in production (direct cutover — no shadow mode).
#
# Prerequisites:
#   - G2.1d final integration gate PASS
#   - Merged main deployed with migrations applied
#   - PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=false verified on running replicas
#
# Run on VPS as root/sudo:
#   sudo PHYSICAL_REFUEL_V2_PREFLIGHT_ACK=YES \
#     bash /opt/synqdrive/current/backend/scripts/ops/vps-enable-physical-refuel-v2-production.sh
#
# Dry-run:
#   sudo DRY_RUN=1 bash .../vps-enable-physical-refuel-v2-production.sh
set -euo pipefail

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
RELEASE_OPS_DIR="${CURRENT}/backend/scripts/ops"
DRY_RUN="${DRY_RUN:-0}"
REQUIRE_ACK="${PHYSICAL_REFUEL_V2_PREFLIGHT_ACK:-0}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

# shellcheck source=vps-production-replica-topology.config.sh
source "${RELEASE_OPS_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${RELEASE_OPS_DIR}/lib/vps-production-replica.lib.sh"

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  echo "${key}=${value}" >> "$tmp"
  mv "$tmp" "$file"
}

echo "=== Physical Refuel V2 production preflight ==="
bash "${RELEASE_OPS_DIR}/physical-refuel-v2-production-preflight.sh"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — would enable PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=true"
  echo "Would set PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT to activation instant"
  exit 0
fi

if [[ "$REQUIRE_ACK" != "YES" ]]; then
  echo "ERROR: set PHYSICAL_REFUEL_V2_PREFLIGHT_ACK=YES after reviewing preflight" >&2
  exit 1
fi

TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD)"
CUTOVER_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

STAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKEND_ENV}.bak-physical-refuel-v2-${STAMP}"
cp "$BACKEND_ENV" "$BACKUP_FILE"
echo "BACKUP_FILE=${BACKUP_FILE}"

echo "=== BEFORE ==="
grep -E '^PHYSICAL_REFUEL_RECONCILIATION_V2_' "$BACKEND_ENV" || true

upsert_env "$BACKEND_ENV" PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED true
upsert_env "$BACKEND_ENV" PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT "$CUTOVER_AT"
upsert_env "$BACKEND_ENV" PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED true
chmod 600 "$BACKEND_ENV"

echo "=== AFTER (file) ==="
grep -E '^PHYSICAL_REFUEL_RECONCILIATION_V2_' "$BACKEND_ENV" || true
grep -E '^PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED=' "$BACKEND_ENV" || true

echo "PHYSICAL_REFUEL_V2_PRODUCTION_CUTOVER_AT=${CUTOVER_AT}"
echo "=== Rolling restart (target SHA ${TARGET_SHA:0:12}) ==="
vps_replica_rolling_deploy "$CURRENT" "$TARGET_SHA"
vps_replica_verify_post_deploy "$CURRENT" "$TARGET_SHA"

echo "PHYSICAL_REFUEL_V2_PRODUCTION_ENABLED=YES"
echo "Physical Refuel V2 direct production cutover complete."
