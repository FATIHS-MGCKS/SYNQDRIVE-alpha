#!/usr/bin/env bash
# EXP-021 S4F-7V — fresh-authority Production Tiny config staging (exactly three env keys).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S4F7V_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7V_SCRIPT_DIR

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/di-v0-s4-fresh-tiny-staging-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-fresh-tiny-staging-production.lib.sh"
# shellcheck source=lib/di-v0-s4-tiny-staging-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-tiny-staging-production.lib.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
DRY_RUN="${DRY_RUN:-0}"
ACK="${DI_S4_TINY_STAGING_ACK:-}"
REQUIRED_SHA="${DI_S4_TINY_STAGING_REQUIRED_SHA:-}"
REQUIRED_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
REQUIRED_PRE_ENV_SHA256="${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}"
EXPECTED_GLOBAL_STATE="${DI_S4_TINY_STAGING_EXPECTED_GLOBAL_STATE:-}"

echo "EXP021_S4F7V_FRESH_TINY_CONFIG_STAGING_WRAPPER=1"
echo "FRESH_STAGING_USES_SEPARATE_EXPLICIT_PATH=YES"
echo "HISTORICAL_S4F7J_BEHAVIOR_PRESERVED=YES"
echo "SUPPORTED_ENV_MUTATION_KEY_COUNT=3"
echo "ARBITRARY_ENV_MUTATION_SUPPORTED=NO"
echo "S4_ENABLE_FLAG_MUTATION_SUPPORTED=NO"
echo "GLOBAL_DB_MUTATION_SUPPORTED=NO"
echo "PROC_ENV_USED_AS_AUTHORITATIVE_RUNTIME_PROOF=NO"
echo "RUNTIME_ATTESTATION_SOURCE=AUTHENTICATED_IN_PROCESS_METRIC"
echo "PROVIDER_CALL_PATH_PRESENT=NO"
echo "EXPECTED_PROVIDER_CALL_DELTA=0"
echo "EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED"
echo "TINY_ACTIVATION_READY=NO"
echo "PRODUCTION_MUTATION_OCCURRED=NO"
echo "DEPLOY_OCCURRED=NO"
echo "MIGRATION_EXECUTED=NO"
echo "SHADOW_ACTIVATION_OCCURRED=NO"

if [[ "$ACK" != "YES" ]]; then
  echo "OPERATOR_ACK=MISSING"
  exit 1
fi

for v in DI_S4_TINY_FRESH_NOT_BEFORE DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST; do
  if [[ -z "${!v:-}" ]]; then
    echo "FRESH_INPUT_MISSING=${v}"
    exit 1
  fi
done

s4f7v_assert_tool_sha_pin || exit 1

DB_CLOCK="$(s4f7v_query_db_clock_canonical)"
export DI_S4F7V_DB_CLOCK_CANONICAL_UTC="$DB_CLOCK"
export DI_S4F7V_FINAL_DB_CLOCK_CANONICAL_UTC="$DB_CLOCK"

s4f7v_run_cli validate-fresh-authority || exit 1

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN_ENV_MUTATION_COUNT=0"
  echo "DRY_RUN_RESTART_COUNT=0"
  s4f7v_run_cli apply-mutation-dry "$BACKEND_ENV" || true
  s4f7v_run_cli intended-delta || true
  echo "PRODUCTION_MUTATION_OCCURRED=NO"
  exit 0
fi

# Future live transaction (backup → exact-three-key mutation → A restart/attest OTHER → B restart/attest → commit).
# Requires explicit operator authorization separate from staging authority; not enabled in this engineering slice.
if [[ "${DI_S4F7V_LIVE_STAGING_AUTHORIZED:-}" == "YES" ]]; then
  echo "LIVE_TRANSACTION_IMPLEMENTATION_PENDING_OPERATOR_RUNBOOK=YES"
  echo "FAIL_CLOSED=YES"
  exit 1
fi

echo "LIVE_MUTATION_NOT_AUTHORIZED_IN_ENGINEERING_SLICE=YES"
echo "FAIL_CLOSED=YES"
exit 1
