#!/usr/bin/env bash
# Portable deterministic BASE vs HEAD RED/GREEN proof for KS MX CH skip resume revalidation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_SHA="${BASE_SHA:-9580a3247a572191a4ead77b6a6c77ea2828855b}"
DEFAULT_HEAD="$(git -C "$ROOT" rev-parse HEAD)"
HEAD_SHA="${HEAD_SHA:-$DEFAULT_HEAD}"
WORKTREE_ROOT="${TMPDIR:-/tmp}/trip-r12-ch-skip-resume-red-proof-$$"
BASE_DIR="$WORKTREE_ROOT/base"
HEAD_DIR="$WORKTREE_ROOT/head"
PROBE_REL="backend/src/modules/vehicle-intelligence/trips/trip-r12-ch-assist-resume-invalidation.postgres-redis.integration.spec.ts"
PROBE_SRC="$ROOT/$PROBE_REL"
METRICS_ROOT="${TMPDIR:-/tmp}/trip-r12-ch-skip-resume-metrics-$$"

fail_infra() {
  local reason="$1"
  cat <<EOF
BASE_SHA=${BASE_SHA}
HEAD_SHA=${HEAD_SHA}
PROBE_INFRASTRUCTURE_ERROR=YES
INFRA_ERROR_DETAIL=${reason}
BASE_RED_EXECUTED_LITERALLY=NO
BASE_FALSE_TERMINALIZATION_REPRODUCED=NO
HEAD_GREEN_PROVEN=NO
EOF
  cleanup
  exit 2
}

cleanup() {
  git -C "$ROOT" worktree remove --force "$BASE_DIR" 2>/dev/null || true
  git -C "$ROOT" worktree remove --force "$HEAD_DIR" 2>/dev/null || true
  rm -rf "$WORKTREE_ROOT" "$METRICS_ROOT"
}

if [[ ! -f "$PROBE_SRC" ]]; then
  fail_infra "PROBE_SOURCE_MISSING path=${PROBE_SRC}"
fi

mkdir -p "$WORKTREE_ROOT" "$METRICS_ROOT"

git -C "$ROOT" fetch --no-tags origin "${BASE_SHA}" "${HEAD_SHA}" >/dev/null 2>&1 || true
git -C "$ROOT" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null || fail_infra "BASE_SHA not available: ${BASE_SHA}"
git -C "$ROOT" cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null || fail_infra "HEAD_SHA not available: ${HEAD_SHA}"

git -C "$ROOT" worktree add --detach "$BASE_DIR" "$BASE_SHA" >/dev/null
git -C "$ROOT" worktree add --detach "$HEAD_DIR" "$HEAD_SHA" >/dev/null

read_metrics() {
  local file="$1"
  local prefix="$2"
  if [[ ! -f "$file" ]]; then
    echo "${prefix}_METRICS_MISSING=YES"
    return 1
  fi
  node -e "
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const p = process.argv[2];
    for (const [k, v] of Object.entries(m)) {
      console.log(p + '_' + k + '=' + JSON.stringify(v));
    }
  " "$file" "$prefix"
}

install_and_run_probe() {
  local dir="$1"
  local label="$2"
  local expect="$3"
  local metrics_file="$METRICS_ROOT/${label,,}-metrics.json"
  local log="/tmp/trip-r12-ch-skip-resume-${label}.log"

  mkdir -p "$(dirname "$dir/$PROBE_REL")"
  cp "$PROBE_SRC" "$dir/$PROBE_REL"

  cd "$dir/backend"
  npm ci >/dev/null 2>&1
  npx prisma generate >/dev/null 2>&1
  npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1

  set +e
  TRIP_R12_POSTGRES_REDIS_INTEGRATION=1 \
  TRIP_R12_POSTGRES_REDIS_REQUIRED=1 \
  TRIP_R12_CH_SKIP_RESUME_METRICS_FILE="$metrics_file" \
  TRIP_R12_CH_SKIP_RESUME_PROBE_EXPECT="$expect" \
  npx jest "$(basename "$PROBE_REL")" \
    -t "BASE/HEAD production race portable probe" \
    --runInBand --forceExit --verbose > "$log" 2>&1
  local exit_code=$?
  set -e

  echo "${label}_PROBE_EXIT=$exit_code"
  echo "${label}_METRICS_FILE=$metrics_file"
  read_metrics "$metrics_file" "$label" || true
}

BASE_METRICS_JSON="$METRICS_ROOT/base-metrics.json"
HEAD_METRICS_JSON="$METRICS_ROOT/head-metrics.json"

install_and_run_probe "$BASE_DIR" BASE BASE > "$METRICS_ROOT/base-out.txt"
cat "$METRICS_ROOT/base-out.txt"

install_and_run_probe "$HEAD_DIR" HEAD HEAD > "$METRICS_ROOT/head-out.txt"
cat "$METRICS_ROOT/head-out.txt"

set +e
VALIDATION="$(BASE_METRICS_JSON="$BASE_METRICS_JSON" HEAD_METRICS_JSON="$HEAD_METRICS_JSON" node -e "
const fs = require('fs');
function load(file) {
  if (!file || !fs.existsSync(file)) return { missing: true };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
const base = load(process.env.BASE_METRICS_JSON);
const head = load(process.env.HEAD_METRICS_JSON);

const baseOk =
  !base.missing &&
  base.BASE_FULL_INACTIVITY_POSSIBLE_END === true &&
  base.BASE_EV1_CUSUM_STILL_ONGOING === true &&
  base.BASE_CH_CANDIDATE_RELATCHED === true &&
  base.BASE_RESUME_OCCURRED_BEFORE_TERMINAL_DECISION === true &&
  base.BASE_RESUME_NOT_YET_VISIBLE_ON_FIRST_FETCH === true &&
  base.BASE_OLD_CH_END_FINALIZED === true &&
  base.BASE_FALSE_TERMINALIZATION_REPRODUCED === true &&
  base.BASE_TRIP_RESTING_BEFORE_TRUE_FINAL_STOP === true;

const headOk =
  !head.missing &&
  head.HEAD_GREEN_PROVEN === true &&
  head.HEAD_OLD_CH_END_NOT_FINALIZED_PREMATURELY === true &&
  head.HEAD_FIRST_FETCH_IMMATURE_DEFERRED === true &&
  head.HEAD_LATER_RESUME_INVALIDATES_OLD_END === true &&
  head.HEAD_SAME_TRIP_CONTINUES === true;

console.log('BASE_RED_EXECUTED_LITERALLY=' + (baseOk ? 'YES' : 'NO'));
console.log('BASE_FALSE_TERMINALIZATION_REPRODUCED=' + (baseOk ? 'YES' : 'NO'));
console.log('HEAD_OLD_CH_END_NOT_FINALIZED_PREMATURELY=' + (head.HEAD_OLD_CH_END_NOT_FINALIZED_PREMATURELY === true ? 'YES' : 'NO'));
console.log('HEAD_GREEN_PROVEN=' + (headOk ? 'YES' : 'NO'));
process.exit(baseOk && headOk ? 0 : 1);
")"
validation_exit=$?
set -e

echo "$VALIDATION"
echo "BASE_SHA=${BASE_SHA}"
echo "HEAD_SHA=${HEAD_SHA}"

if [[ "$validation_exit" -ne 0 ]]; then
  cleanup
  exit "$validation_exit"
fi

cleanup
