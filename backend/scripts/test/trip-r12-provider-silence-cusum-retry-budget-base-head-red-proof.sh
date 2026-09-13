#!/usr/bin/env bash
# PRE_FIX vs HEAD proof for provider-silence × #1627 retry-budget interoperability.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PRE_FIX_SHA="${PRE_FIX_SHA:-e4c3a535134e98ffcba5190ea65ef4bd73fe9fa1}"
DEFAULT_HEAD="$(git -C "$ROOT" rev-parse HEAD)"
HEAD_SHA="${HEAD_SHA:-$DEFAULT_HEAD}"
WORKTREE_ROOT="${TMPDIR:-/tmp}/trip-r12-silence-retry-red-proof-$$"
PRE_FIX_DIR="$WORKTREE_ROOT/pre-fix"
HEAD_DIR="$WORKTREE_ROOT/head"
PROBE_REL="backend/src/modules/vehicle-intelligence/trips/trip-r12-provider-silence-cusum-retry-budget.postgres-redis.integration.spec.ts"
PROBE_SRC="$ROOT/$PROBE_REL"
METRICS_ROOT="${TMPDIR:-/tmp}/trip-r12-silence-retry-metrics-$$"

fail_infra() {
  local reason="$1"
  cat <<EOF
PRE_FIX_SHA=${PRE_FIX_SHA}
HEAD_SHA=${HEAD_SHA}
PROBE_INFRASTRUCTURE_ERROR=YES
INFRA_ERROR_DETAIL=${reason}
PRE_FIX_DEFECT_REPRODUCED=NO
HEAD_SILENCE_GREEN_PROVEN=NO
EOF
  cleanup
  exit 2
}

cleanup() {
  git -C "$ROOT" worktree remove --force "$PRE_FIX_DIR" 2>/dev/null || true
  git -C "$ROOT" worktree remove --force "$HEAD_DIR" 2>/dev/null || true
  rm -rf "$WORKTREE_ROOT" "$METRICS_ROOT"
}

if [[ ! -f "$PROBE_SRC" ]]; then
  fail_infra "PROBE_SOURCE_MISSING path=${PROBE_SRC}"
fi

mkdir -p "$WORKTREE_ROOT" "$METRICS_ROOT"

git -C "$ROOT" fetch --no-tags origin "${PRE_FIX_SHA}" "${HEAD_SHA}" >/dev/null 2>&1 || true
git -C "$ROOT" cat-file -e "${PRE_FIX_SHA}^{commit}" 2>/dev/null || fail_infra "PRE_FIX_SHA not available: ${PRE_FIX_SHA}"
git -C "$ROOT" cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null || fail_infra "HEAD_SHA not available: ${HEAD_SHA}"

git -C "$ROOT" worktree add --detach "$PRE_FIX_DIR" "$PRE_FIX_SHA" >/dev/null
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
  local log="/tmp/trip-r12-silence-retry-${label}.log"

  mkdir -p "$(dirname "$dir/$PROBE_REL")"
  cp "$PROBE_SRC" "$dir/$PROBE_REL"

  cd "$dir/backend"
  npm ci >/dev/null 2>&1
  npx prisma generate >/dev/null 2>&1
  npx prisma db push --accept-data-loss --skip-generate >/dev/null 2>&1

  set +e
  TRIP_R12_POSTGRES_REDIS_INTEGRATION=1 \
  TRIP_R12_POSTGRES_REDIS_REQUIRED=1 \
  TRIP_R12_SILENCE_RETRY_METRICS_FILE="$metrics_file" \
  TRIP_R12_SILENCE_RETRY_PROBE_EXPECT="$expect" \
  npx jest "$(basename "$PROBE_REL")" \
    --runInBand --forceExit --verbose > "$log" 2>&1
  local exit_code=$?
  set -e

  echo "${label}_PROBE_EXIT=$exit_code"
  echo "${label}_METRICS_FILE=$metrics_file"
  read_metrics "$metrics_file" "$label" || true
}

PRE_FIX_METRICS_JSON="$METRICS_ROOT/pre-fix-metrics.json"
HEAD_METRICS_JSON="$METRICS_ROOT/head-metrics.json"

install_and_run_probe "$PRE_FIX_DIR" PRE_FIX PRE_FIX > "$METRICS_ROOT/pre-fix-out.txt"
cat "$METRICS_ROOT/pre-fix-out.txt"

install_and_run_probe "$HEAD_DIR" HEAD HEAD > "$METRICS_ROOT/head-out.txt"
cat "$METRICS_ROOT/head-out.txt"

set +e
VALIDATION="$(PRE_FIX_METRICS_JSON="$PRE_FIX_METRICS_JSON" HEAD_METRICS_JSON="$HEAD_METRICS_JSON" node -e "
const fs = require('fs');
function load(file) {
  if (!file || !fs.existsSync(file)) return { missing: true };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
const pre = load(process.env.PRE_FIX_METRICS_JSON);
const head = load(process.env.HEAD_METRICS_JSON);

const preOk =
  !pre.missing &&
  pre.PRE_FIX_DEFECT_REPRODUCED === true &&
  pre.PRE_FIX_MAX_FALLBACK_REACHED === false &&
  pre.PRE_FIX_EV4_EXECUTED === true;

const headOk =
  !head.missing &&
  head.HEAD_SILENCE_GREEN_PROVEN === true &&
  head.HEAD_SILENCE_EV_RUN_COUNT === 3 &&
  head.HEAD_SILENCE_EV4_EXECUTED === false &&
  head.HEAD_SILENCE_MAX_FALLBACK_REACHED === true;

console.log('PRE_FIX_DEFECT_REPRODUCED=' + (preOk ? 'YES' : 'NO'));
console.log('HEAD_SILENCE_GREEN_PROVEN=' + (headOk ? 'YES' : 'NO'));
process.exit(preOk && headOk ? 0 : 1);
")"
validation_exit=$?
set -e

echo "$VALIDATION"
echo "PRE_FIX_SHA=${PRE_FIX_SHA}"
echo "HEAD_SHA=${HEAD_SHA}"

if [[ "$validation_exit" -ne 0 ]]; then
  cleanup
  exit "$validation_exit"
fi

cleanup
