#!/usr/bin/env bash
# Staged RFRF production enablement — one stage per invocation (F10.1 / F10.1.1).
#
# Dry-run (fixture/local testing):
#   DRY_RUN=1 RFRF_FIXTURE_MODE=1 RFRF_REQUIRED_GIT_SHA=<sha> \
#     RFRF_CUTOVER_AT=2026-09-15T20:00:00.000Z RFRF_STAGE=1 bash rfrf-production-enable-stage.sh
#
# Production (requires explicit ACK + preflight PASS + approved SHA):
#   sudo RFRF_REQUIRED_GIT_SHA=<approved-sha> RFRF_CUTOVER_AT=<utc-iso> \
#     RFRF_STAGE=1 RFRF_ROLLOUT_ACK=YES bash rfrf-production-enable-stage.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/rfrf-production-rollout.lib.sh
source "${SCRIPT_DIR}/lib/rfrf-production-rollout.lib.sh"
# shellcheck source=vps-production-replica-topology.config.sh
source "${SCRIPT_DIR}/vps-production-replica-topology.config.sh"
# shellcheck source=lib/vps-production-replica.lib.sh
source "${SCRIPT_DIR}/lib/vps-production-replica.lib.sh"

BACKEND_ENV="${BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"
CURRENT="${SYNQDRIVE_CURRENT_LINK:-/opt/synqdrive/current}"
PROM_DIR="${PROM_DIR:-/opt/synqdrive/shared/prometheus}"
DRY_RUN="${DRY_RUN:-0}"
STAGE="${RFRF_STAGE:-}"
ACK="${RFRF_ROLLOUT_ACK:-0}"
CUTOVER_AT="${RFRF_CUTOVER_AT:-}"

if [[ -z "$STAGE" ]]; then
  echo "ERROR: set RFRF_STAGE=0..6 (one stage per invocation; no enable-all path)" >&2
  exit 2
fi

if [[ "$STAGE" == "all" || "$STAGE" == "*" ]]; then
  echo "ERROR: enable-all shortcut forbidden" >&2
  exit 2
fi

if ! [[ "$STAGE" =~ ^[0-6]$ ]]; then
  echo "ERROR: invalid RFRF_STAGE=${STAGE}" >&2
  exit 2
fi

echo "=== RFRF STAGED ENABLE stage=${STAGE} dry_run=${DRY_RUN} ==="

rfrf_require_approved_deploy_sha || exit 1

if rfrf_is_fixture_mode && [[ "$DRY_RUN" == "1" ]]; then
  echo "RFRF_PREFLIGHT=FIXTURE_SKIPPED"
else
  bash "${SCRIPT_DIR}/rfrf-production-preflight.sh" --check || {
    echo "ERROR: preflight BLOCKED — cannot enter stage ${STAGE}" >&2
    exit 1
  }
fi

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "ERROR: ${BACKEND_ENV} missing" >&2
  exit 1
fi

if (( STAGE == 1 )); then
  if [[ -z "$CUTOVER_AT" ]]; then
    if rfrf_is_fixture_mode; then
      CUTOVER_AT="2026-09-15T20:00:00.000Z"
    else
      rfrf_rollout_fail "Stage 1 requires explicit operator-supplied RFRF_CUTOVER_AT (UTC ISO timestamp)"
      exit 1
    fi
  fi
fi

if ! rfrf_assert_can_enter_stage "$STAGE" "$BACKEND_ENV" "$CUTOVER_AT"; then
  exit 1
fi

if (( STAGE >= 5 )); then
  if rfrf_is_fixture_mode && [[ -n "${RFRF_PROMETHEUS_FIXTURE_DIR:-}${RFRF_PROMETHEUS_FIXTURE:-}" ]]; then
    echo "LIVE_OBSERVABILITY=FIXTURE"
  elif ! rfrf_verify_live_observability_gates "${PROM_DIR}/prometheus.yml"; then
    rfrf_rollout_fail "live observability gates incomplete — Stage ${STAGE} blocked"
    exit 1
  fi
fi

if (( STAGE == 6 )); then
  if rfrf_is_fixture_mode; then
    echo "WORKER_READINESS=FIXTURE_SKIPPED"
  elif ! rfrf_verify_dual_replica_worker_readiness; then
    rfrf_rollout_fail "worker/redis readiness gate failed — Stage 6 blocked"
    exit 1
  fi
fi

if (( STAGE == 5 )); then
  if ! bash "${SCRIPT_DIR}/rfrf-production-blast-radius-assessment.sh"; then
    rfrf_rollout_fail "blast-radius assessment failed — Stage 5 blocked"
    exit 1
  fi
  if [[ "${RFRF_BLAST_RADIUS_PASS:-0}" != "1" ]]; then
    rfrf_rollout_fail "Stage 5 requires RFRF_BLAST_RADIUS_PASS=1 after successful blast-radius assessment"
    exit 1
  fi
fi

echo "CURRENT_STAGE_BEFORE=$(rfrf_detect_stage_from_flags "$BACKEND_ENV")"
echo "TARGET_STAGE=${STAGE}"
echo "EXPECTED=$(rfrf_stage_expected_flags "$STAGE")"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — would apply stage ${STAGE} mutations"
  if (( STAGE == 1 )); then
    echo "Would set ${RFRF_FLAG_CUTOVER}=${CUTOVER_AT}"
  fi
  echo "Would rolling-restart replicas from ${CURRENT}"
  echo "RFRF_STAGE_DRY_RUN=PASS"
  exit 0
fi

if [[ "$ACK" != "YES" ]]; then
  echo "ERROR: set RFRF_ROLLOUT_ACK=YES after reviewing preflight + stage plan" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKEND_ENV}.bak-rfrf-stage${STAGE}-${STAMP}"
cp "$BACKEND_ENV" "$BACKUP_FILE"
echo "BACKUP_FILE=${BACKUP_FILE}"

echo "=== BEFORE ==="
rfrf_read_flag_snapshot "$BACKEND_ENV"

rfrf_apply_stage_mutations "$STAGE" "$BACKEND_ENV" "$CUTOVER_AT"
chmod 600 "$BACKEND_ENV"

echo "=== AFTER (file) ==="
rfrf_read_flag_snapshot "$BACKEND_ENV"

TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "=== Rolling restart target SHA ${TARGET_SHA} ==="
vps_replica_rolling_deploy "$CURRENT" "$TARGET_SHA"
vps_replica_verify_post_deploy "$CURRENT" "$TARGET_SHA"

echo "RFRF_STAGE_${STAGE}_ENABLED=YES"
echo "RFRF_STAGED_ENABLEMENT=PASS"
