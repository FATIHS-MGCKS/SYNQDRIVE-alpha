#!/usr/bin/env bash
# Enable Battery V2 Stage-2 corrected production activation.
# Stage-2 contract: REST_SHADOW=true + PUBLICATION=true + RECONCILIATION=true
#
# Run on VPS as root:
#   sudo bash /opt/synqdrive/current/backend/scripts/ops/vps-enable-battery-v2-stage2-production.sh
#
# Dry-run (no mutations, no ACK required):
#   sudo DRY_RUN=1 bash .../vps-enable-battery-v2-stage2-production.sh
set -euo pipefail
set -E

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/battery-v2-stage2-cutover.lib.sh
source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover.lib.sh"

if [[ -n "${BATTERY_V2_STAGE2_TEST_HARNESS:-}" ]]; then
  # shellcheck source=lib/battery-v2-stage2-cutover-test-harness.sh
  source "${SCRIPT_DIR}/lib/battery-v2-stage2-cutover-test-harness.sh"
fi

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
RELEASE_OPS_DIR="${CURRENT}/backend/scripts/ops"
DRY_RUN="${DRY_RUN:-0}"
REQUIRE_PREFLIGHT_ACK="${BATTERY_V2_STAGE2_REQUIRE_PREFLIGHT_ACK:-1}"
BACKUP_FILE=""
MUTATION_APPLIED=0
ACTIVATION_SUCCEEDED=0
TARGET_SHA=""

on_activation_failure() {
  local exit_code=$?
  trap - ERR

  if [[ -n "$BACKUP_FILE" ]]; then
    echo "BACKUP_FILE=${BACKUP_FILE}"
    echo "ROLLBACK_COMMAND=atomic-env-rollback:${BACKUP_FILE}"
  fi

  if [[ "$DRY_RUN" == "1" || "$MUTATION_APPLIED" != "1" || "$ACTIVATION_SUCCEEDED" == "1" ]]; then
    exit "$exit_code"
  fi

  echo "ACTIVATION_FAILED_AFTER_MUTATION=YES"
  if battery_v2_stage2_execute_atomic_env_rollback "$BACKEND_ENV" "$BACKUP_FILE" "$CURRENT" "$TARGET_SHA"; then
    echo "ATOMIC_ROLLBACK_SUCCESSFUL=YES"
    exit "$exit_code"
  fi

  echo "ROLLBACK_RUNTIME_VERIFIED=NO"
  battery_v2_stage2_emit_manual_recovery "$BACKUP_FILE" "$BACKEND_ENV"
  exit 2
}

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

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — would set REST_SHADOW=true PUBLICATION=true RECONCILIATION=true"
  echo "Would run rolling restart to target SHA: $(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "No backend.env changes applied."
  echo "No BATTERY_V2_STAGE2_PREFLIGHT_ACK required for dry-run."
  exit 0
fi

if [[ "$REQUIRE_PREFLIGHT_ACK" == "1" && "${BATTERY_V2_STAGE2_PREFLIGHT_ACK:-}" != "YES" ]]; then
  echo "ERROR: set BATTERY_V2_STAGE2_PREFLIGHT_ACK=YES after reviewing preflight output" >&2
  exit 1
fi

# Load canonical deploy authority BEFORE env mutation so rollback can restart replicas.
TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD)"
export SYNQDRIVE_CURRENT_LINK="$CURRENT"
export SYNQDRIVE_EXTERNAL_HEALTH_URL="${SYNQDRIVE_EXTERNAL_HEALTH_URL:-https://app.synqdrive.eu/api/v1/health}"
# shellcheck source=vps-production-replica-topology.config.sh
source "${RELEASE_OPS_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${RELEASE_OPS_DIR}/lib/vps-production-replica.lib.sh"

trap on_activation_failure ERR

STAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKEND_ENV}.bak-battery-v2-stage2-${STAMP}"
cp "$BACKEND_ENV" "$BACKUP_FILE"
echo "BACKUP_FILE=${BACKUP_FILE}"

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
MUTATION_APPLIED=1

echo "=== AFTER (file) ==="
grep -E '^BATTERY_V2_(PUBLICATION|REST_SHADOW|RECONCILIATION)_' "$BACKEND_ENV" || true

echo "=== Rolling restart (target SHA ${TARGET_SHA:0:12}) ==="
battery_v2_stage2_rolling_deploy "$CURRENT" "$TARGET_SHA"
battery_v2_stage2_verify_post_deploy "$CURRENT" "$TARGET_SHA"

trap - ERR
ACTIVATION_SUCCEEDED=1

echo "=== Effective PM2 config ==="
if [[ -z "${BATTERY_V2_STAGE2_TEST_HARNESS:-}" ]]; then
  bash "${RELEASE_OPS_DIR}/battery-v2-m3-canary-observability.sh" config
else
  echo "BATTERY_V2_STAGE2_TEST_HARNESS=skip_observability"
fi

ACTIVATION_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "BATTERY_V2_STAGE2_T0=${ACTIVATION_TS}"
echo "Battery V2 Stage-2 corrected activation complete."
