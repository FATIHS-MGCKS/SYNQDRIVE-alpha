#!/usr/bin/env bash
# EXP-021 S4F-7AO — enable five S4 Tiny flags (native OFF); preserves staged keys; GLOBAL KILLED only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S4F7AO_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7AO_SCRIPT_DIR
S4F7J_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7J_SCRIPT_DIR
S4F4_SCRIPT_DIR="$SCRIPT_DIR"
export S4F4_SCRIPT_DIR
S4F7F_SCRIPT_DIR="$SCRIPT_DIR"
export S4F7F_SCRIPT_DIR

# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"
# shellcheck source=lib/di-v0-s4f-global-budget-rollout.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4f-global-budget-rollout.lib.sh"
# shellcheck source=lib/di-v0-s4-global-kill-init-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-global-kill-init-production.lib.sh"
# shellcheck source=lib/di-v0-s4-tiny-staging-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-tiny-staging-production.lib.sh"
# shellcheck source=lib/di-v0-s4-five-flag-tiny-activation-production.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-five-flag-tiny-activation-production.lib.sh"
# shellcheck source=lib/di-v0-s4-five-flag-tiny-activation-transaction.lib.sh
source "${SCRIPT_DIR}/lib/di-v0-s4-five-flag-tiny-activation-transaction.lib.sh"

BACKEND_ENV="${SYNQDRIVE_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
export SYNQDRIVE_BACKEND_ENV="$BACKEND_ENV"
DRY_RUN="${DRY_RUN:-0}"

echo "EXP021_S4F7AO_FIVE_FLAG_TINY_ACTIVATION_WRAPPER=1"
echo "SUPPORTED_ENV_MUTATION_KEY_COUNT=5"
echo "S4_ENABLE_FLAG_MUTATION_SUPPORTED=YES"
echo "GLOBAL_DB_MUTATION_SUPPORTED=NO"
echo "STAGED_KEYS_PRESERVED=YES"
echo "NATIVE_REMAINS_OFF=YES"
echo "GLOBAL_KILL_ENFORCED=YES"
echo "S4_ACTIVATION_OCCURRED=NO"
echo "PROVIDER_CALL_PATH_PRESENT=NO"
echo "EXPECTED_PROVIDER_CALL_DELTA=0"

if [[ "$DRY_RUN" == "1" ]]; then
  TARGET_SHA="$(s4f7j_resolve_deployed_sha)"
  REQUIRED_RELEASE_ID="${DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID:-}"
  REQUIRED_PRE_ENV_SHA256="${DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256:-}"
  if ! s4f7ao_preflight_readonly; then
    exit 1
  fi
  DRY_RUN_COPY="$(mktemp)"
  cp "$BACKEND_ENV" "$DRY_RUN_COPY"
  BEFORE_SHA="$(s4f4_file_sha256 "$BACKEND_ENV")"
  s4f7ao_run_cli apply-mutation-dry "$DRY_RUN_COPY"
  rm -f "$DRY_RUN_COPY"
  AFTER_SHA="$(s4f4_file_sha256 "$BACKEND_ENV")"
  if [[ "$BEFORE_SHA" != "$AFTER_SHA" ]]; then
    echo "DRY_RUN_PRODUCTION_ENV_MUTATED=YES"
    exit 1
  fi
  s4f7ao_run_cli intended-delta "$BACKEND_ENV"
  echo "DRY_RUN_FULL_GUARD_PATH_EXECUTED=YES"
  echo "DRY_RUN_ENV_MUTATION_COUNT=0"
  echo "DRY_RUN_RESTART_COUNT=0"
  exit 0
fi

if ! s4f7ao_execute_five_flag_transaction; then
  echo "FAIL_CLOSED=YES"
  exit 1
fi
exit 0
