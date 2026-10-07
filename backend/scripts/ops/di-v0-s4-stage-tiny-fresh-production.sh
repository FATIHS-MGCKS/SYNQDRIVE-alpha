#!/usr/bin/env bash
# EXP-021 S4F-7V / S4F-7W / S4F-7Y — fresh-authority Production Tiny config staging (exactly three env keys).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S4F7V_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7V_SCRIPT_DIR
S4F7J_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7J_SCRIPT_DIR
S4F4_SCRIPT_DIR="$SCRIPT_DIR"
export S4F4_SCRIPT_DIR
S4F7F_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7F_SCRIPT_DIR

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/di-v0-s4-fresh-tiny-staging-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-fresh-tiny-staging-production.lib.sh"
# shellcheck source=lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh"
# shellcheck source=lib/di-v0-s4-tiny-staging-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-tiny-staging-production.lib.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"
# shellcheck source=lib/di-v0-s4f-global-budget-rollout.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4f-global-budget-rollout.lib.sh"
# shellcheck source=lib/di-v0-s4-global-kill-init-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-global-kill-init-production.lib.sh"

BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
export SYNQDRIVE_BACKEND_ENV="$BACKEND_ENV"
DRY_RUN="${DRY_RUN:-0}"
ACK="${DI_S4_TINY_STAGING_ACK:-}"

echo "EXP021_S4F7V_FRESH_TINY_CONFIG_STAGING_WRAPPER=1"
echo "EXP021_S4F7W_DRY_RUN_WIRING=1"
echo "EXP021_S4F7Y_LIVE_TRANSACTION_CLOSURE=1"
echo "EXP021_S4F7Y_1_LIVE_TRANSACTION_SAFETY_SEAL=1"
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
echo "INITIAL_PRODUCTION_MUTATION_STATE=NONE"
echo "INITIAL_PRODUCTION_STAGING_AUTHORIZED_STATE=NONE"
echo "INITIAL_PRODUCTION_STAGING_EXECUTED_STATE=NONE"
echo "DEPLOY_OCCURRED=NO"
echo "MIGRATION_EXECUTED=NO"
echo "SHADOW_ACTIVATION_OCCURRED=NO"
echo "LIVE_STAGING_SHELL_EXECUTION_READY=YES"
echo "LIVE_STAGING_REMAINS_FAIL_CLOSED_WITHOUT_EXACT_OPERATOR_AUTHORIZATION=YES"

if [[ "$ACK" != "YES" ]]; then
  echo "OPERATOR_ACK=MISSING"
  exit 1
fi

s4f7v_assert_tool_sha_pin || exit 1

s4f7w_require_staging_pins || exit 1

for v in DI_S4_TINY_FRESH_NOT_BEFORE DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST; do
  if [[ -z "${!v:-}" ]]; then
    echo "FRESH_INPUT_MISSING=${v}"
    exit 1
  fi
done

if [[ "$DRY_RUN" == "1" ]]; then
  s4f7w_live_preflight_readonly || exit 1

  DB_CLOCK="$(s4f7v_query_db_clock_canonical)"
  export DI_S4F7V_DB_CLOCK_CANONICAL_UTC="$DB_CLOCK"
  echo "DB_CLOCK_CANONICAL_UTC=${DB_CLOCK}"

  s4f7v_run_cli validate-fresh-authority || exit 1

  export DI_S4F7V_FINAL_DB_CLOCK_CANONICAL_UTC="$(s4f7v_query_db_clock_canonical)"

  if ! s4f7v_run_cli guards; then
    echo "DRY_RUN_REQUIRES_GUARDS_OK=YES"
    exit 1
  fi
  echo "DRY_RUN_REQUIRES_GUARDS_OK=YES"
  echo "FULL_GUARDS_COMMAND_EXECUTED_BY_DRY_RUN=YES"

  DRY_RUN_ENV_COPY="$(mktemp)"
  cp "$BACKEND_ENV" "$DRY_RUN_ENV_COPY"
  BEFORE_ENV_SHA="$(s4f4_file_sha256 "$BACKEND_ENV")"
  s4f7v_run_cli apply-mutation-dry "$DRY_RUN_ENV_COPY"
  rm -f "$DRY_RUN_ENV_COPY"
  AFTER_ENV_SHA="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if [[ "$BEFORE_ENV_SHA" != "$AFTER_ENV_SHA" ]]; then
    echo "DRY_RUN_PRODUCTION_ENV_MUTATED=YES"
    exit 1
  fi

  s4f7v_run_cli intended-delta

  s4f7w_emit_dry_run_success_contract
  exit 0
fi

if [[ "${DI_S4F7Y_LIVE_STAGING_AUTHORIZED:-}" == "YES" ]]; then
  if ! s4f7y_execute_live_transaction; then
    echo "FAIL_CLOSED=YES"
    exit 1
  fi
  exit 0
fi

if [[ "${DI_S4F7V_LIVE_STAGING_AUTHORIZED:-}" == "YES" ]]; then
  echo "OLD_S4F7V_AUTHORIZATION_ALONE_CAN_AUTHORIZE_LIVE_MUTATION=NO"
  echo "DEDICATED_LIVE_STAGING_AUTHORIZATION_REQUIRED=YES"
  echo "LIVE_STAGING_AUTHORIZATION_VALID=NO"
  echo "FAIL_CLOSED=YES"
  echo "PRODUCTION_STAGING_AUTHORIZED=NO"
  echo "PRODUCTION_STAGING_EXECUTED=NO"
  echo "PRODUCTION_MUTATION_OCCURRED=NO"
  exit 1
fi

echo "LIVE_STAGING_AUTHORIZATION_VALID=NO"
echo "LIVE_MUTATION_NOT_AUTHORIZED=YES"
echo "PRODUCTION_STAGING_AUTHORIZED=NO"
echo "PRODUCTION_STAGING_EXECUTED=NO"
echo "PRODUCTION_MUTATION_OCCURRED=NO"
echo "FAIL_CLOSED=YES"
exit 1
