#!/usr/bin/env bash
# Enable ERD legacy RECHARGE fragment product-read collapse globally (single env key).
# Product-read only; raw VEE rows unchanged. Requires rolling restart of both replicas at SAME SHA.
#
# Production (operator on VPS):
#   sudo ERD_LEGACY_FRAGMENT_ROLLOUT_ACK=YES bash .../vps-enable-erd-recharge-legacy-fragment-product-read-production.sh
#
# Dry-run:
#   sudo DRY_RUN=1 bash .../vps-enable-erd-recharge-legacy-fragment-product-read-production.sh
set -euo pipefail

CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
RELEASE_OPS_DIR="${CURRENT}/backend/scripts/ops"
# shellcheck source=vps-production-replica-topology.config.sh
source "${RELEASE_OPS_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${RELEASE_OPS_DIR}/lib/vps-production-replica.lib.sh"

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
FLAG_KEY="ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED"
DRY_RUN="${DRY_RUN:-0}"
ACK="${ERD_LEGACY_FRAGMENT_ROLLOUT_ACK:-0}"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: $BACKEND_ENV not found" >&2
  exit 1
fi

TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD)"
export SYNQDRIVE_CURRENT_LINK="$CURRENT"
export SYNQDRIVE_EXTERNAL_HEALTH_URL="${SYNQDRIVE_EXTERNAL_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"

echo "=== ERD legacy fragment product-read activation preflight ==="
echo "TARGET_SHA=${TARGET_SHA}"
echo "P4B16_STATE_FILE=/opt/synqdrive/shared/deploy-state/release-attestation.state"
if [[ -f /opt/synqdrive/shared/deploy-state/release-attestation.state ]]; then
  grep -E '^(STATUS|DEPLOYED_SHA)=' /opt/synqdrive/shared/deploy-state/release-attestation.state || true
fi
curl -sf -o /dev/null -w "replica_a_health=%{http_code}\n" "http://127.0.0.1:${SYNQDRIVE_REPLICA_A_PORT}/api/v1/health"
if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
  curl -sf -o /dev/null -w "replica_b_health=%{http_code}\n" "http://127.0.0.1:${SYNQDRIVE_REPLICA_B_PORT}/api/v1/health"
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — would set ${FLAG_KEY}=1 and rolling restart at SHA ${TARGET_SHA}"
  exit 0
fi

if [[ "$ACK" != "YES" ]]; then
  echo "ERROR: set ERD_LEGACY_FRAGMENT_ROLLOUT_ACK=YES after owner authorization" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKEND_ENV}.bak-erd-legacy-fragment-${STAMP}"
cp "$BACKEND_ENV" "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
BACKEND_ENV_SHA256_BEFORE="$(sha256sum "$BACKEND_ENV" | awk '{print $1}')"
echo "BACKUP_FILE=${BACKUP_FILE}"
echo "BACKEND_ENV_SHA256_BEFORE=${BACKEND_ENV_SHA256_BEFORE}"

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${key}=" "$file" > "$tmp" || true
  echo "${key}=${value}" >> "$tmp"
  mv "$tmp" "$file"
}

echo "=== BEFORE ==="
grep -E "^${FLAG_KEY}=" "$BACKEND_ENV" || echo "${FLAG_KEY}=<unset>"

upsert_env "$BACKEND_ENV" "$FLAG_KEY" "1"
chmod 600 "$BACKEND_ENV"

echo "=== AFTER (file) ==="
grep -E "^${FLAG_KEY}=" "$BACKEND_ENV"

echo "=== Rolling restart (same SHA) ==="
vps_replica_rolling_deploy "$CURRENT" "$TARGET_SHA"
vps_replica_verify_post_deploy "$CURRENT" "$TARGET_SHA"

ACTIVATION_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "ERD_LEGACY_FRAGMENT_PRODUCT_READ_ACTIVATION_T0=${ACTIVATION_TS}"
echo "ERD legacy fragment product-read global activation complete."
