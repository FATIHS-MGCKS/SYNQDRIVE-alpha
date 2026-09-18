#!/usr/bin/env bash
# Reverse-order RFRF authority shutdown (fail-closed rollback helper).
# F10.4.0 — Stage-2 rollback uses production-grade backup + rolling restart + stage verify.
#
# Usage:
#   DRY_RUN=1 bash rfrf-production-rollback.sh --from-stage 2
#   sudo RFRF_ROLLOUT_ACK=YES bash rfrf-production-rollback.sh --from-stage 2
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
  vps_replica_ensure_registered() { return 0; }
  vps_replica_restart_one() { return 0; }
  vps_replica_wait_healthy() { return 0; }
  vps_replica_verify_post_deploy() { return 0; }
  vps_replica_verify_no_mixed_sha() { return 0; }
fi

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
DRY_RUN="${DRY_RUN:-0}"
ACK="${RFRF_ROLLOUT_ACK:-0}"
FROM_STAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-stage)
      FROM_STAGE="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 --from-stage <1-6>" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$FROM_STAGE" =~ ^[1-6]$ ]]; then
  echo "ERROR: --from-stage 1..6 required" >&2
  exit 2
fi

echo "=== RFRF ROLLBACK from stage ${FROM_STAGE} dry_run=${DRY_RUN} ==="
echo "ROLLBACK_DATA_DELETION=NO (authorities only; durable rows preserved)"
echo "SIGKILL_LIMITATION_DOCUMENTED=YES"

rfrf_rollout_run_preflight() {
  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" == "1" ]]; then
    echo "RFRF_PREFLIGHT=ROLLBACK_TEST_FIXTURE_PASS"
    return 0
  fi
  if rfrf_is_fixture_mode && [[ "$DRY_RUN" == "1" ]]; then
    echo "RFRF_PREFLIGHT=FIXTURE_SKIPPED"
    return 0
  fi
  bash "${SCRIPT_DIR}/rfrf-production-preflight.sh" --check --live-required
}

rfrf_rollback_rolling_restart() {
  local target_sha="$1"
  cd "${SYNQDRIVE_CURRENT_LINK}/backend"
  vps_replica_ensure_registered || return 1
  if [[ "${RFRF_TEST_INJECT_ROLLBACK_RESTART_A_FAIL:-0}" == "1" ]]; then
    echo "INJECTED_FAILURE=rollback_restart_a"
    return 1
  fi
  vps_replica_restart_one "${SYNQDRIVE_REPLICA_A_PM2_NAME}" || return 1
  vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_A_PM2_NAME}" "${SYNQDRIVE_REPLICA_A_PORT}" "$target_sha" || return 1
  if [[ "${SYNQDRIVE_PRODUCTION_REPLICA_COUNT}" -ge 2 ]]; then
    if [[ "${RFRF_TEST_INJECT_ROLLBACK_RESTART_B_FAIL:-0}" == "1" ]]; then
      echo "INJECTED_FAILURE=rollback_restart_b"
      return 1
    fi
    vps_replica_restart_one "${SYNQDRIVE_REPLICA_B_PM2_NAME}" || return 1
    vps_replica_wait_healthy "${SYNQDRIVE_REPLICA_B_PM2_NAME}" "${SYNQDRIVE_REPLICA_B_PORT}" "$target_sha" || return 1
  fi
  if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" != "1" ]]; then
    pm2 save
  fi
  return 0
}

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — would disable authorities for stage ${FROM_STAGE} downward"
  case "$FROM_STAGE" in
    6) echo "Would set ${RFRF_FLAG_G2_HANDOFF}=false" ;;
    5) echo "Would set ${RFRF_FLAG_PROMOTION}=false" ;;
    4) echo "Would set ${RFRF_FLAG_CONVERGENCE}=false" ;;
    3) echo "Would set ${RFRF_FLAG_PERSIST}=false" ;;
    2)
      echo "Would set ${RFRF_FLAG_MASTER}=false"
      echo "Would preserve ${RFRF_FLAG_CUTOVER} unchanged"
      echo "ROLLBACK_STAGE2_VERIFY_TARGET=1"
      ;;
    1) echo "Would remove ${RFRF_FLAG_CUTOVER} (optional; document operator choice)" ;;
  esac
  echo "RFRF_ROLLBACK_DRY_RUN=PASS"
  exit 0
fi

rfrf_require_approved_deploy_sha || exit 1

if ! rfrf_rollout_run_preflight; then
  echo "ERROR: preflight BLOCKED — cannot rollback from stage ${FROM_STAGE}" >&2
  exit 1
fi

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: ${BACKEND_ENV} missing" >&2
  exit 1
fi

TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "CURRENT_PRODUCTION_SHA=${TARGET_SHA}"
echo "RFRF_REQUIRED_GIT_SHA=${RFRF_REQUIRED_GIT_SHA}"

if [[ "$TARGET_SHA" != "$RFRF_REQUIRED_GIT_SHA" && "$TARGET_SHA" != "unknown" ]]; then
  rfrf_rollout_fail "runtime SHA mismatch: current=${TARGET_SHA} required=${RFRF_REQUIRED_GIT_SHA}"
  exit 1
fi

current_stage="$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
if [[ "$current_stage" != "$FROM_STAGE" ]]; then
  rfrf_rollout_fail "current stage ${current_stage} != --from-stage ${FROM_STAGE}"
  exit 1
fi

if [[ "$ACK" != "YES" ]]; then
  echo "ERROR: set RFRF_ROLLOUT_ACK=YES for mutating rollback" >&2
  exit 1
fi

expected_after_stage=$((FROM_STAGE - 1))
AUTHORITATIVE_CUTOVER="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
STAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKEND_ENV}.bak-rfrf-rollback-${STAMP}"

if ! rfrf_create_verified_backend_env_backup "$BACKEND_ENV" "$BACKUP_FILE"; then
  rfrf_rollout_fail "rollback backup checksum verification failed"
  exit 1
fi
BACKEND_ENV_SHA256_BEFORE="$(rfrf_file_sha256 "$BACKEND_ENV")"
echo "BACKUP_FILE=${BACKUP_FILE}"
echo "BACKUP_CHECKSUM_VERIFIED=YES"

rfrf_apply_rollback_stage "$FROM_STAGE" "$BACKEND_ENV"
chmod 600 "$BACKEND_ENV"

post_cutover="$(rfrf_env_get "$BACKEND_ENV" "$RFRF_FLAG_CUTOVER")"
if [[ "$FROM_STAGE" == "2" ]]; then
  if ! rfrf_assert_cutover_immutable_across_mutation "$AUTHORITATIVE_CUTOVER" "$post_cutover"; then
    rfrf_rollout_fail "rollback stage 2 must preserve cutover"
    exit 1
  fi
fi

if ! rfrf_verify_stage_env_state "$expected_after_stage" "$BACKEND_ENV" "$AUTHORITATIVE_CUTOVER"; then
  rfrf_rollout_fail "rollback env verify failed for stage ${expected_after_stage}"
  exit 1
fi

echo "=== Rolling restart target SHA ${TARGET_SHA} (rollback) ==="
if ! rfrf_rollback_rolling_restart "$TARGET_SHA"; then
  echo "ROLLBACK_FAILURE_EVIDENCE backup=${BACKUP_FILE} sha256_before=${BACKEND_ENV_SHA256_BEFORE}"
  rfrf_rollout_fail "rollback rolling restart failed"
  exit 1
fi

if [[ "${RFRF_ROLLBACK_TEST_MODE:-0}" != "1" ]]; then
  vps_replica_verify_post_deploy "$CURRENT" "$TARGET_SHA" || {
    rfrf_rollout_fail "rollback post-deploy verify failed"
    exit 1
  }
fi

if ! rfrf_verify_stage_env_state "$expected_after_stage" "$BACKEND_ENV" "$AUTHORITATIVE_CUTOVER"; then
  rfrf_rollout_fail "rollback post-restart stage verify failed"
  exit 1
fi

echo "RFRF_ROLLBACK_FROM_STAGE_${FROM_STAGE}=YES"
echo "RFRF_ROLLBACK_TARGET_STAGE=${expected_after_stage}"
echo "RFRF_ROLLBACK=PASS"
echo "STAGE2_ROLLBACK_PRODUCTION_SAFE=YES"
