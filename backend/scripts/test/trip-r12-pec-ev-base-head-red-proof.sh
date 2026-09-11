#!/usr/bin/env bash
# Portable deterministic BASE vs HEAD RED probe for PEC/EV lock-order regression.
# Copies the probe spec into isolated worktrees — never counts missing test files as RED.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_SHA="${BASE_SHA:-24c2632a1bad2d72a97442d45285ddb6c530def9}"
HEAD_SHA="${HEAD_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
WORKTREE_ROOT="${TMPDIR:-/tmp}/trip-r12-pec-ev-red-proof-$$"
BASE_DIR="$WORKTREE_ROOT/base"
HEAD_DIR="$WORKTREE_ROOT/head"
PROBE_REL="backend/src/modules/vehicle-intelligence/trips/trip-r12-pec-ev-base-head-red-probe.postgres-redis.integration.spec.ts"
PROBE_SRC="$ROOT/$PROBE_REL"

cleanup() {
  git -C "$ROOT" worktree remove --force "$BASE_DIR" 2>/dev/null || true
  git -C "$ROOT" worktree remove --force "$HEAD_DIR" 2>/dev/null || true
  rm -rf "$WORKTREE_ROOT"
}
trap cleanup EXIT

if [[ ! -f "$PROBE_SRC" ]]; then
  echo "PROBE_SOURCE_MISSING=YES path=$PROBE_SRC" >&2
  exit 2
fi

mkdir -p "$WORKTREE_ROOT"
git -C "$ROOT" worktree add --detach "$BASE_DIR" "$BASE_SHA" >/dev/null
git -C "$ROOT" worktree add --detach "$HEAD_DIR" "$HEAD_SHA" >/dev/null

install_and_run_probe() {
  local dir="$1"
  local label="$2"
  local log="/tmp/trip-r12-red-probe-${label}.log"

  mkdir -p "$(dirname "$dir/$PROBE_REL")"
  cp "$PROBE_SRC" "$dir/$PROBE_REL"

  cd "$dir/backend"
  npm ci >/dev/null 2>&1
  npx prisma generate >/dev/null 2>&1
  npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1

  set +e
  TRIP_R12_POSTGRES_REDIS_INTEGRATION=1 \
  TRIP_R12_POSTGRES_REDIS_REQUIRED=1 \
  npx jest "$(basename "$PROBE_REL")" \
    --runInBand --forceExit --verbose 2>&1 | tee "$log"
  local exit_code="${PIPESTATUS[0]}"
  set -e

  echo "${label}_PROBE_EXIT=$exit_code" | tee -a "$log"

  parse_metric() {
    local key="$1"
    local default="${2:-UNKNOWN}"
    local val
    val="$(grep -E "^PROBE_METRIC ${key}=" "$log" | tail -1 | sed "s/^PROBE_METRIC ${key}=//" || true)"
    if [[ -z "$val" ]]; then
      echo "$default"
    else
      echo "$val"
    fi
  }

  echo "${label}_PROBE_EXECUTED=$(parse_metric PROBE_EXECUTED false)"
  echo "${label}_TEST_INFRASTRUCTURE_ERROR=$(parse_metric BASE_TEST_INFRASTRUCTURE_ERROR false)"
  echo "${label}_SCHEDULE_WHILE_PEC_LOCK_HELD=$(parse_metric SCHEDULE_WHILE_PEC_LOCK_HELD false)"
  echo "${label}_EV_PROCESSOR_ENTRY=$(parse_metric EV_PROCESSOR_ENTRY false)"
  echo "${label}_EV_LOCK_MISS=$(parse_metric EV_LOCK_MISS false)"
  echo "${label}_EV_TRACKING_RUN_COUNT=$(parse_metric EV_TRACKING_RUN_COUNT 0)"
  echo "${label}_FINALIZE_REACHED=$(parse_metric FINALIZE_REACHED false)"
  echo "${label}_TRIP_COMPLETED=$(parse_metric TRIP_COMPLETED false)"
  echo "${label}_RESTING=$(parse_metric RESTING false)"
  echo "${label}_TERMINAL_STATE=$(parse_metric TERMINAL_STATE NONTERMINAL)"
}

echo "=== BASE probe @ ${BASE_SHA} ==="
BASE_OUT="$(install_and_run_probe "$BASE_DIR" BASE)"
echo "$BASE_OUT"

echo "=== HEAD probe @ ${HEAD_SHA} ==="
HEAD_OUT="$(install_and_run_probe "$HEAD_DIR" HEAD)"
echo "$HEAD_OUT"

eval "$(echo "$BASE_OUT" | grep -E '^BASE_')"
eval "$(echo "$HEAD_OUT" | grep -E '^HEAD_')"

BASE_PROBE_EXECUTED="${BASE_PROBE_EXECUTED:-UNKNOWN}"
BASE_TEST_INFRASTRUCTURE_ERROR="${BASE_TEST_INFRASTRUCTURE_ERROR:-UNKNOWN}"
BASE_SCHEDULE_WHILE_PEC_LOCK_HELD="${BASE_SCHEDULE_WHILE_PEC_LOCK_HELD:-UNKNOWN}"
BASE_EV_PROCESSOR_ENTRY="${BASE_EV_PROCESSOR_ENTRY:-UNKNOWN}"
BASE_EV_LOCK_MISS="${BASE_EV_LOCK_MISS:-UNKNOWN}"
BASE_EV_TRACKING_RUN_COUNT="${BASE_EV_TRACKING_RUN_COUNT:-UNKNOWN}"
BASE_TERMINAL_STATE="${BASE_TERMINAL_STATE:-UNKNOWN}"

HEAD_PROBE_EXECUTED="${HEAD_PROBE_EXECUTED:-UNKNOWN}"
HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD="${HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD:-UNKNOWN}"
HEAD_EV_LOCK_ACQUIRED="$( [[ "${HEAD_EV_LOCK_MISS:-true}" == "false" && "${HEAD_EV_PROCESSOR_ENTRY:-false}" == "true" ]] && echo YES || echo NO )"
HEAD_EV_TRACKING_RUN_COUNT="${HEAD_EV_TRACKING_RUN_COUNT:-UNKNOWN}"
HEAD_FINALIZE_REACHED="${HEAD_FINALIZE_REACHED:-UNKNOWN}"
HEAD_TRIP_COMPLETED="${HEAD_TRIP_COMPLETED:-UNKNOWN}"
HEAD_RESTING="${HEAD_RESTING:-UNKNOWN}"

BASE_RED_OK=NO
HEAD_GREEN_OK=NO

if [[ "$BASE_PROBE_EXECUTED" == "true" && "$BASE_TEST_INFRASTRUCTURE_ERROR" == "false" ]]; then
  if [[ "$BASE_SCHEDULE_WHILE_PEC_LOCK_HELD" == "true" \
     && "$BASE_EV_PROCESSOR_ENTRY" == "true" \
     && "$BASE_EV_LOCK_MISS" == "true" \
     && "$BASE_EV_TRACKING_RUN_COUNT" == "0" \
     && "$BASE_TERMINAL_STATE" == "NONTERMINAL" ]]; then
    BASE_RED_OK=YES
  fi
fi

if [[ "$HEAD_PROBE_EXECUTED" == "true" ]]; then
  if [[ "$HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD" == "false" \
     && "$HEAD_EV_LOCK_ACQUIRED" == "YES" \
     && "${HEAD_EV_TRACKING_RUN_COUNT:-0}" -ge 1 \
     && "$HEAD_FINALIZE_REACHED" == "true" \
     && "$HEAD_TRIP_COMPLETED" == "true" \
     && "$HEAD_RESTING" == "true" ]]; then
    HEAD_GREEN_OK=YES
  fi
fi

cat <<EOF
BASE_SHA=${BASE_SHA}
HEAD_SHA=${HEAD_SHA}
BASE_PROBE_EXECUTED=${BASE_PROBE_EXECUTED}
BASE_TEST_INFRASTRUCTURE_ERROR=${BASE_TEST_INFRASTRUCTURE_ERROR}
BASE_SCHEDULE_WHILE_PEC_LOCK_HELD=${BASE_SCHEDULE_WHILE_PEC_LOCK_HELD}
BASE_EV_PROCESSOR_ENTRY=${BASE_EV_PROCESSOR_ENTRY}
BASE_EV_LOCK_MISS=${BASE_EV_LOCK_MISS}
BASE_EV_TRACKING_RUN_COUNT=${BASE_EV_TRACKING_RUN_COUNT}
BASE_TERMINAL_STATE=${BASE_TERMINAL_STATE}
HEAD_PROBE_EXECUTED=${HEAD_PROBE_EXECUTED}
HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD=${HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD}
HEAD_EV_LOCK_ACQUIRED=${HEAD_EV_LOCK_ACQUIRED}
HEAD_EV_TRACKING_RUN_COUNT=${HEAD_EV_TRACKING_RUN_COUNT}
HEAD_FINALIZE_REACHED=${HEAD_FINALIZE_REACHED}
HEAD_TRIP_COMPLETED=${HEAD_TRIP_COMPLETED}
HEAD_RESTING=${HEAD_RESTING}
BASE_RED_REPRODUCED=${BASE_RED_OK}
HEAD_FIX_VALID=${HEAD_GREEN_OK}
EOF

if [[ "$BASE_RED_OK" != "YES" || "$HEAD_GREEN_OK" != "YES" ]]; then
  exit 1
fi
