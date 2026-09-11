#!/usr/bin/env bash
# Portable deterministic BASE vs HEAD RED probe for PEC/EV lock-order regression.
# Copies the probe spec into isolated worktrees — never counts infra failures as RED.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_SHA="${BASE_SHA:-24c2632a1bad2d72a97442d45285ddb6c530def9}"
HEAD_SHA="${HEAD_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"
WORKTREE_ROOT="${TMPDIR:-/tmp}/trip-r12-pec-ev-red-proof-$$"
BASE_DIR="$WORKTREE_ROOT/base"
HEAD_DIR="$WORKTREE_ROOT/head"
PROBE_REL="backend/src/modules/vehicle-intelligence/trips/trip-r12-pec-ev-base-head-red-probe.postgres-redis.integration.spec.ts"
PROBE_SRC="$ROOT/$PROBE_REL"
METRICS_ROOT="${TMPDIR:-/tmp}/trip-r12-probe-metrics-$$"

BASE_COMMIT_AVAILABLE=NO
HEAD_COMMIT_AVAILABLE=NO
BASE_PROBE_RUN_ID="${GITHUB_RUN_ID:-local}"
HEAD_PROBE_RUN_ID="${GITHUB_RUN_ID:-local}"

fail_infra() {
  local reason="$1"
  cat <<EOF
BASE_SHA=${BASE_SHA}
HEAD_SHA=${HEAD_SHA}
BASE_COMMIT_AVAILABLE=${BASE_COMMIT_AVAILABLE}
HEAD_COMMIT_AVAILABLE=${HEAD_COMMIT_AVAILABLE}
PROBE_INFRASTRUCTURE_ERROR=YES
INFRA_ERROR_DETAIL=${reason}
BASE_PROBE_EXECUTED=NO
HEAD_PROBE_EXECUTED=NO
BASE_RED_REPRODUCED=NO
HEAD_GREEN_PROVEN=NO
EOF
  exit 2
}

cleanup() {
  git -C "$ROOT" worktree remove --force "$BASE_DIR" 2>/dev/null || true
  git -C "$ROOT" worktree remove --force "$HEAD_DIR" 2>/dev/null || true
  rm -rf "$WORKTREE_ROOT" "$METRICS_ROOT"
}
trap cleanup EXIT

if [[ ! -f "$PROBE_SRC" ]]; then
  fail_infra "PROBE_SOURCE_MISSING path=${PROBE_SRC}"
fi

mkdir -p "$WORKTREE_ROOT" "$METRICS_ROOT"

git -C "$ROOT" fetch --no-tags origin "${BASE_SHA}" "${HEAD_SHA}" >/dev/null 2>&1 || true
if git -C "$ROOT" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  BASE_COMMIT_AVAILABLE=YES
else
  fail_infra "BASE_SHA not available locally: ${BASE_SHA}"
fi
if git -C "$ROOT" cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
  HEAD_COMMIT_AVAILABLE=YES
else
  fail_infra "HEAD_SHA not available locally: ${HEAD_SHA}"
fi

git -C "$ROOT" worktree add --detach "$BASE_DIR" "$BASE_SHA" >/dev/null
git -C "$ROOT" worktree add --detach "$HEAD_DIR" "$HEAD_SHA" >/dev/null

read_metrics() {
  local file="$1"
  local prefix="$2"
  if [[ ! -f "$file" ]]; then
    echo "${prefix}_PROBE_EXECUTED=NO"
    echo "${prefix}_TEST_INFRASTRUCTURE_ERROR=YES"
    echo "${prefix}_METRICS_MISSING=YES"
    return 1
  fi
  node -e "
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const p = process.argv[2];
    const fields = [
      'PROBE_EXECUTED','PROBE_INFRASTRUCTURE_ERROR','SCHEDULE_WHILE_PEC_LOCK_HELD',
      'EV_PROCESSOR_ENTRY','EV_LOCK_MISS','EV_LOCK_ACQUIRED','EV_TRACKING_RUN_COUNT',
      'FINALIZE_REACHED','TRIP_COMPLETED','RESTING','TERMINAL_STATE'
    ];
    for (const f of fields) {
      const v = m[f];
      if (v === undefined || v === null) {
        console.log(p + '_METRIC_MISSING_' + f + '=YES');
      } else {
        console.log(p + '_' + f + '=' + JSON.stringify(v));
        if (f === 'PROBE_INFRASTRUCTURE_ERROR') {
          console.log(p + '_TEST_INFRASTRUCTURE_ERROR=' + JSON.stringify(v));
        }
      }
    }
    if (m.INFRA_ERROR_DETAIL) console.log(p + '_INFRA_ERROR_DETAIL=' + JSON.stringify(m.INFRA_ERROR_DETAIL));
  " "$file" "$prefix"
}

install_and_run_probe() {
  local dir="$1"
  local label="$2"
  local metrics_file="$METRICS_ROOT/${label,,}-metrics.json"
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
  TRIP_R12_PROBE_METRICS_FILE="$metrics_file" \
  npx jest "$(basename "$PROBE_REL")" \
    --runInBand --forceExit --verbose 2>&1 | tee "$log"
  local exit_code="${PIPESTATUS[0]}"
  set -e

  echo "${label}_PROBE_EXIT=$exit_code" | tee -a "$log"
  echo "${label}_METRICS_FILE=$metrics_file" | tee -a "$log"
  read_metrics "$metrics_file" "$label" || true
}

echo "=== BASE probe @ ${BASE_SHA} ==="
BASE_OUT="$(install_and_run_probe "$BASE_DIR" BASE)"
echo "$BASE_OUT"

echo "=== HEAD probe @ ${HEAD_SHA} ==="
HEAD_OUT="$(install_and_run_probe "$HEAD_DIR" HEAD)"
echo "$HEAD_OUT"

parse_field() {
  local out="$1"
  local key="$2"
  echo "$out" | sed -n "s/^${key}=//p" | tail -1
}

BASE_PROBE_EXECUTED="$(parse_field "$BASE_OUT" BASE_PROBE_EXECUTED)"
BASE_TEST_INFRASTRUCTURE_ERROR="$(parse_field "$BASE_OUT" BASE_PROBE_INFRASTRUCTURE_ERROR)"
BASE_SCHEDULE_WHILE_PEC_LOCK_HELD="$(parse_field "$BASE_OUT" BASE_SCHEDULE_WHILE_PEC_LOCK_HELD)"
BASE_EV_PROCESSOR_ENTRY="$(parse_field "$BASE_OUT" BASE_EV_PROCESSOR_ENTRY)"
BASE_EV_LOCK_MISS="$(parse_field "$BASE_OUT" BASE_EV_LOCK_MISS)"
BASE_EV_TRACKING_RUN_COUNT="$(parse_field "$BASE_OUT" BASE_EV_TRACKING_RUN_COUNT)"
BASE_FINALIZE_REACHED="$(parse_field "$BASE_OUT" BASE_FINALIZE_REACHED)"
BASE_TRIP_COMPLETED="$(parse_field "$BASE_OUT" BASE_TRIP_COMPLETED)"
BASE_RESTING="$(parse_field "$BASE_OUT" BASE_RESTING)"
BASE_TERMINAL_STATE="$(parse_field "$BASE_OUT" BASE_TERMINAL_STATE)"

HEAD_PROBE_EXECUTED="$(parse_field "$HEAD_OUT" HEAD_PROBE_EXECUTED)"
HEAD_TEST_INFRASTRUCTURE_ERROR="$(parse_field "$HEAD_OUT" HEAD_PROBE_INFRASTRUCTURE_ERROR)"
HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD="$(parse_field "$HEAD_OUT" HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD)"
HEAD_EV_PROCESSOR_ENTRY="$(parse_field "$HEAD_OUT" HEAD_EV_PROCESSOR_ENTRY)"
HEAD_EV_LOCK_MISS="$(parse_field "$HEAD_OUT" HEAD_EV_LOCK_MISS)"
HEAD_EV_LOCK_ACQUIRED="$(parse_field "$HEAD_OUT" HEAD_EV_LOCK_ACQUIRED)"
HEAD_EV_TRACKING_RUN_COUNT="$(parse_field "$HEAD_OUT" HEAD_EV_TRACKING_RUN_COUNT)"
HEAD_FINALIZE_REACHED="$(parse_field "$HEAD_OUT" HEAD_FINALIZE_REACHED)"
HEAD_TRIP_COMPLETED="$(parse_field "$HEAD_OUT" HEAD_TRIP_COMPLETED)"
HEAD_RESTING="$(parse_field "$HEAD_OUT" HEAD_RESTING)"
HEAD_TERMINAL_STATE="$(parse_field "$HEAD_OUT" HEAD_TERMINAL_STATE)"

BASE_RED_OK=NO
HEAD_GREEN_OK=NO

if [[ "$BASE_PROBE_EXECUTED" == "true" && "$BASE_TEST_INFRASTRUCTURE_ERROR" == "false" ]]; then
  if [[ "$BASE_SCHEDULE_WHILE_PEC_LOCK_HELD" == "true" \
     && "$BASE_EV_PROCESSOR_ENTRY" == "true" \
     && "$BASE_EV_LOCK_MISS" == "true" \
     && "$BASE_EV_TRACKING_RUN_COUNT" == "0" \
     && "$BASE_FINALIZE_REACHED" == "false" \
     && "$BASE_TRIP_COMPLETED" == "false" \
     && "$BASE_RESTING" == "false" \
     && "$BASE_TERMINAL_STATE" == "NONTERMINAL" ]]; then
    BASE_RED_OK=YES
  fi
fi

if [[ "$HEAD_PROBE_EXECUTED" == "true" && "$HEAD_TEST_INFRASTRUCTURE_ERROR" == "false" ]]; then
  if [[ "$HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD" == "false" \
     && "$HEAD_EV_PROCESSOR_ENTRY" == "true" \
     && "$HEAD_EV_LOCK_ACQUIRED" == "true" \
     && "$HEAD_EV_LOCK_MISS" == "false" \
     && "${HEAD_EV_TRACKING_RUN_COUNT:-0}" -ge 1 \
     && "$HEAD_FINALIZE_REACHED" == "true" \
     && "$HEAD_TRIP_COMPLETED" == "true" \
     && "$HEAD_RESTING" == "true" \
     && "$HEAD_TERMINAL_STATE" == "TERMINAL" ]]; then
    HEAD_GREEN_OK=YES
  fi
fi

cat <<EOF
BASE_SHA=${BASE_SHA}
HEAD_SHA=${HEAD_SHA}
BASE_COMMIT_AVAILABLE=${BASE_COMMIT_AVAILABLE}
HEAD_COMMIT_AVAILABLE=${HEAD_COMMIT_AVAILABLE}
BASE_PROBE_RUN_ID=${BASE_PROBE_RUN_ID}
BASE_PROBE_EXECUTED=${BASE_PROBE_EXECUTED:-UNKNOWN}
BASE_TEST_INFRASTRUCTURE_ERROR=${BASE_TEST_INFRASTRUCTURE_ERROR:-UNKNOWN}
BASE_SCHEDULE_WHILE_PEC_LOCK_HELD=${BASE_SCHEDULE_WHILE_PEC_LOCK_HELD:-UNKNOWN}
BASE_EV_PROCESSOR_ENTRY=${BASE_EV_PROCESSOR_ENTRY:-UNKNOWN}
BASE_EV_LOCK_MISS=${BASE_EV_LOCK_MISS:-UNKNOWN}
BASE_EV_TRACKING_RUN_COUNT=${BASE_EV_TRACKING_RUN_COUNT:-UNKNOWN}
BASE_FINALIZE_REACHED=${BASE_FINALIZE_REACHED:-UNKNOWN}
BASE_TRIP_COMPLETED=${BASE_TRIP_COMPLETED:-UNKNOWN}
BASE_RESTING=${BASE_RESTING:-UNKNOWN}
BASE_TERMINAL_STATE=${BASE_TERMINAL_STATE:-UNKNOWN}
HEAD_PROBE_EXECUTED=${HEAD_PROBE_EXECUTED:-UNKNOWN}
HEAD_TEST_INFRASTRUCTURE_ERROR=${HEAD_TEST_INFRASTRUCTURE_ERROR:-UNKNOWN}
HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD=${HEAD_SCHEDULE_WHILE_PEC_LOCK_HELD:-UNKNOWN}
HEAD_EV_PROCESSOR_ENTRY=${HEAD_EV_PROCESSOR_ENTRY:-UNKNOWN}
HEAD_EV_LOCK_ACQUIRED=${HEAD_EV_LOCK_ACQUIRED:-UNKNOWN}
HEAD_EV_LOCK_MISS=${HEAD_EV_LOCK_MISS:-UNKNOWN}
HEAD_EV_TRACKING_RUN_COUNT=${HEAD_EV_TRACKING_RUN_COUNT:-UNKNOWN}
HEAD_FINALIZE_REACHED=${HEAD_FINALIZE_REACHED:-UNKNOWN}
HEAD_TRIP_COMPLETED=${HEAD_TRIP_COMPLETED:-UNKNOWN}
HEAD_RESTING=${HEAD_RESTING:-UNKNOWN}
HEAD_TERMINAL_STATE=${HEAD_TERMINAL_STATE:-UNKNOWN}
BASE_RED_REPRODUCED=${BASE_RED_OK}
HEAD_GREEN_PROVEN=${HEAD_GREEN_OK}
EOF

if [[ "$BASE_RED_OK" != "YES" || "$HEAD_GREEN_OK" != "YES" ]]; then
  exit 1
fi
