#!/usr/bin/env bash
# Reverse-order RFRF authority shutdown (fail-closed rollback helper).
#
# Usage:
#   DRY_RUN=1 bash rfrf-production-rollback.sh --from-stage 6
#   sudo RFRF_ROLLOUT_ACK=YES bash rfrf-production-rollback.sh --from-stage 6
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

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — would disable authorities for stage ${FROM_STAGE} downward"
  case "$FROM_STAGE" in
    6) echo "Would set ${RFRF_FLAG_G2_HANDOFF}=false" ;;
    5) echo "Would set ${RFRF_FLAG_PROMOTION}=false" ;;
    4) echo "Would set ${RFRF_FLAG_CONVERGENCE}=false" ;;
    3) echo "Would set ${RFRF_FLAG_PERSIST}=false" ;;
    2) echo "Would set ${RFRF_FLAG_MASTER}=false" ;;
    1) echo "Would remove ${RFRF_FLAG_CUTOVER} (optional; document operator choice)" ;;
  esac
  echo "RFRF_ROLLBACK_DRY_RUN=PASS"
  exit 0
fi

if [[ "$ACK" != "YES" ]]; then
  echo "ERROR: set RFRF_ROLLOUT_ACK=YES for mutating rollback" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP_FILE="${BACKEND_ENV}.bak-rfrf-rollback-${STAMP}"
cp "$BACKEND_ENV" "$BACKUP_FILE"
echo "BACKUP_FILE=${BACKUP_FILE}"

rfrf_apply_rollback_stage "$FROM_STAGE" "$BACKEND_ENV"
chmod 600 "$BACKEND_ENV"

TARGET_SHA="$(git -C "$CURRENT" rev-parse HEAD 2>/dev/null || echo unknown)"
vps_replica_rolling_deploy "$CURRENT" "$TARGET_SHA"
vps_replica_verify_post_deploy "$CURRENT" "$TARGET_SHA"

echo "RFRF_ROLLBACK_FROM_STAGE_${FROM_STAGE}=YES"
echo "RFRF_ROLLBACK=PASS"
