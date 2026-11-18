#!/usr/bin/env bash
# Portable deterministic BASE vs HEAD RED probe for PEC/EV lock-order regression.
# Copies the probe spec into isolated worktrees — never counts infra failures as RED.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_SHA="${BASE_SHA:-24c2632a1bad2d72a97442d45285ddb6c530def9}"
DEFAULT_HEAD="$(git -C "$ROOT" rev-parse HEAD)"
if [[ -z "${HEAD_SHA:-}" && -f "${GITHUB_EVENT_PATH:-}" ]]; then
  HEAD_SHA="$(node -e "
    const fs = require('fs');
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const head = event.pull_request?.head?.sha || event.workflow_dispatch?.inputs?.head_sha || '';
    process.stdout.write(head);
  " 2>/dev/null || true)"
fi
HEAD_SHA="${HEAD_SHA:-$DEFAULT_HEAD}"
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
  cleanup
  exit 2
}

# shellcheck disable=SC1091
source "$ROOT/backend/scripts/test/lib/trip-r12-base-head-red-proof-db-isolation.lib.sh"
trip_r12_bh_db_isolation_init "$ROOT" "test_trip_r12_pec_ev" "$BASE_PROBE_RUN_ID"

cleanup() {
  trip_r12_bh_release_all_probe_databases || true
  git -C "$ROOT" worktree remove --force "$BASE_DIR" 2>/dev/null || true
  git -C "$ROOT" worktree remove --force "$HEAD_DIR" 2>/dev/null || true
  rm -rf "$WORKTREE_ROOT" "$METRICS_ROOT"
}

# Writes sanitized tail of a log file to stderr (CI-visible even when stdout is redirected).
emit_sanitized_log_tail() {
  local log_file="$1"
  local max_lines="${2:-20}"
  if [[ ! -f "$log_file" ]]; then
    echo "LOG_TAIL_MISSING path=$(basename "$log_file")" >&2
    return 0
  fi
  echo "=== sanitized log tail ($(basename "$log_file"), last ${max_lines} lines) ===" >&2
  sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$log_file" 2>/dev/null |
    tail -n "$max_lines" |
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="$(printf '%s' "$line" | sed -E \
        -e 's#(postgres(ql)?(\+srv)?://)[^ @]+@#\1[REDACTED]@#g' \
        -e 's#(redis(s)?://)[^ @]+@#\1[REDACTED]@#g' \
        -e 's#(npm_[A-Za-z0-9_]+=)[^ ]+#\1[REDACTED]#g' \
        -e 's#/_authToken=[^ ]+#/_authToken=[REDACTED]#g')"
      if ((${#line} > 320)); then
        line="${line:0:320}...[truncated]"
      fi
      printf '%s\n' "$line" >&2
    done
}

report_resource_pressure() {
  echo "=== resource pressure (df -h) ===" >&2
  df -h / /tmp "${WORKTREE_ROOT}" 2>/dev/null | sed 's/  */ /g' >&2 || true
  echo "=== resource pressure (df -i) ===" >&2
  df -i / /tmp 2>/dev/null | sed 's/  */ /g' >&2 || true
}

fail_probe_bootstrap() {
  local label="$1"
  local phase="$2"
  local exit_code="$3"
  local log_file="${4:-}"

  {
    echo "PROBE_BOOTSTRAP_FAILURE=YES"
    echo "PROBE_LABEL=${label}"
    echo "PROBE_BOOTSTRAP_PHASE=${phase}"
    echo "PROBE_BOOTSTRAP_EXIT=${exit_code}"
  } >&2

  report_resource_pressure
  if [[ -n "$log_file" ]]; then
    emit_sanitized_log_tail "$log_file"
  fi

  fail_infra "BOOTSTRAP_${label}_${phase}_exit_${exit_code}"
}

run_bootstrap_step() {
  local label="$1"
  local phase="$2"
  local log_file="$3"
  shift 3

  echo "=== ${label} bootstrap: ${phase} (start) ===" >&2
  set +e
  "$@" >"$log_file" 2>&1
  local exit_code=$?
  set -e
  echo "${label}_BOOTSTRAP_${phase^^}_EXIT=${exit_code}" >&2
  if [[ "$exit_code" -ne 0 ]]; then
    fail_probe_bootstrap "$label" "$phase" "$exit_code" "$log_file"
  fi
  echo "=== ${label} bootstrap: ${phase} (ok) ===" >&2
}

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
      'PROBE_EXECUTED','PROBE_INFRASTRUCTURE_ERROR','PROBE_EXPECT','SCHEDULE_WHILE_PEC_LOCK_HELD',
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
  local expect="$3"
  local metrics_file="$METRICS_ROOT/${label,,}-metrics.json"
  local log="/tmp/trip-r12-red-probe-${label}.log"
  local boot_log_dir="$METRICS_ROOT/${label,,}-bootstrap"
  local probe_database_url=""
  local probe_db_name=""
  local saved_database_url="${DATABASE_URL:-}"

  mkdir -p "$(dirname "$dir/$PROBE_REL")" "$boot_log_dir"
  cp "$PROBE_SRC" "$dir/$PROBE_REL"

  echo "=== ${label} probe @ ${dir} (TRIP_R12_PROBE_EXPECT=${expect}) ===" >&2

  trip_r12_bh_probe_scope_enter "$label" probe_database_url "$saved_database_url"
  probe_db_name="${TRIP_R12_BH_SCOPE_ACTIVE_PROBE_DB_NAME}"

  local prev_cwd="$PWD"
  cd "$dir/backend"
  run_bootstrap_step "$label" npm_ci "$boot_log_dir/npm-ci.log" env DATABASE_URL="$probe_database_url" npm ci
  run_bootstrap_step "$label" prisma_generate "$boot_log_dir/prisma-generate.log" \
    env DATABASE_URL="$probe_database_url" npx prisma generate
  run_bootstrap_step "$label" prisma_db_push "$boot_log_dir/prisma-db-push.log" \
    env DATABASE_URL="$probe_database_url" npx prisma db push --accept-data-loss --skip-generate

  set +e
  DATABASE_URL="$probe_database_url" \
  TRIP_R12_POSTGRES_REDIS_INTEGRATION=1 \
  TRIP_R12_POSTGRES_REDIS_REQUIRED=1 \
  TRIP_R12_PROBE_METRICS_FILE="$metrics_file" \
  TRIP_R12_PROBE_EXPECT="$expect" \
  npx jest "$(basename "$PROBE_REL")" \
    --runInBand --forceExit --verbose > "$log" 2>&1
  local exit_code=$?
  set -e
  cd "$prev_cwd"

  echo "${label}_PROBE_EXIT=$exit_code" >&2
  echo "${label}_PROBE_EXIT=$exit_code"
  if [[ "$exit_code" -ne 0 ]]; then
    echo "${label}_PROBE_FAILED_PHASE=jest" >&2
    report_resource_pressure
    emit_sanitized_log_tail "$log"
  fi
  echo "${label}_METRICS_FILE=$metrics_file"
  echo "${label}_DATABASE_ISOLATED=YES"
  echo "${label}_DATABASE_NAME=${probe_db_name}"
  read_metrics "$metrics_file" "$label" || true
  trip_r12_bh_probe_scope_leave || echo "${label}_PROBE_DB_CLEANUP_FAILED=YES" >&2
}

BASE_METRICS_JSON="$METRICS_ROOT/base-metrics.json"
HEAD_METRICS_JSON="$METRICS_ROOT/head-metrics.json"

echo "=== BASE probe @ ${BASE_SHA} (expect=BASE) ==="
BASE_OUT_FILE="$METRICS_ROOT/base-out.txt"
install_and_run_probe "$BASE_DIR" BASE BASE > "$BASE_OUT_FILE"
BASE_OUT="$(cat "$BASE_OUT_FILE")"
echo "$BASE_OUT"

echo "=== HEAD probe @ ${HEAD_SHA} (expect=HEAD) ==="
HEAD_OUT_FILE="$METRICS_ROOT/head-out.txt"
install_and_run_probe "$HEAD_DIR" HEAD HEAD > "$HEAD_OUT_FILE"
HEAD_OUT="$(cat "$HEAD_OUT_FILE")"
echo "$HEAD_OUT"

set +e
VALIDATION="$(BASE_METRICS_JSON="$BASE_METRICS_JSON" HEAD_METRICS_JSON="$HEAD_METRICS_JSON" node -e "
const fs = require('fs');

function loadMetrics(file) {
  if (!file || !fs.existsSync(file)) {
    return { missing: true, reason: 'metrics_file_missing', file };
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const base = loadMetrics(process.env.BASE_METRICS_JSON);
const head = loadMetrics(process.env.HEAD_METRICS_JSON);

function emit(prefix, m) {
  if (m.missing) {
    console.log(prefix + '_PROBE_EXECUTED=NO');
    console.log(prefix + '_TEST_INFRASTRUCTURE_ERROR=YES');
    return;
  }
  const fields = [
    'PROBE_EXECUTED','PROBE_INFRASTRUCTURE_ERROR','SCHEDULE_WHILE_PEC_LOCK_HELD',
    'EV_PROCESSOR_ENTRY','EV_LOCK_MISS','EV_LOCK_ACQUIRED','EV_TRACKING_RUN_COUNT',
    'FINALIZE_REACHED','TRIP_COMPLETED','RESTING','TERMINAL_STATE'
  ];
  for (const f of fields) {
    const v = m[f];
    console.log(prefix + '_' + f + '=' + (v === undefined || v === null ? 'UNKNOWN' : JSON.stringify(v)));
    if (f === 'PROBE_INFRASTRUCTURE_ERROR') {
      console.log(prefix + '_TEST_INFRASTRUCTURE_ERROR=' + JSON.stringify(v ?? true));
    }
  }
}

emit('BASE', base);
emit('HEAD', head);

const baseOk =
  base.PROBE_EXECUTED === true &&
  base.PROBE_INFRASTRUCTURE_ERROR === false &&
  base.SCHEDULE_WHILE_PEC_LOCK_HELD === true &&
  base.EV_PROCESSOR_ENTRY === true &&
  base.EV_LOCK_MISS === true &&
  base.EV_TRACKING_RUN_COUNT === 0 &&
  base.FINALIZE_REACHED === false &&
  base.TRIP_COMPLETED === false &&
  base.RESTING === false &&
  base.TERMINAL_STATE === 'NONTERMINAL';

const headOk =
  head.PROBE_EXECUTED === true &&
  head.PROBE_INFRASTRUCTURE_ERROR === false &&
  head.SCHEDULE_WHILE_PEC_LOCK_HELD === false &&
  head.EV_PROCESSOR_ENTRY === true &&
  head.EV_LOCK_ACQUIRED === true &&
  head.EV_LOCK_MISS === false &&
  Number(head.EV_TRACKING_RUN_COUNT ?? 0) >= 1 &&
  head.FINALIZE_REACHED === true &&
  head.TRIP_COMPLETED === true &&
  head.RESTING === true &&
  head.TERMINAL_STATE === 'TERMINAL';

console.log('BASE_RED_REPRODUCED=' + (baseOk ? 'YES' : 'NO'));
console.log('HEAD_GREEN_PROVEN=' + (headOk ? 'YES' : 'NO'));
if (base.missing) console.log('BASE_METRICS_LOAD_ERROR=' + JSON.stringify(base.reason ?? 'missing'));
if (head.missing) console.log('HEAD_METRICS_LOAD_ERROR=' + JSON.stringify(head.reason ?? 'missing'));
process.exit(baseOk && headOk ? 0 : 1);
")"
validation_exit=$?
set -e

echo "$VALIDATION"

cat <<EOF
BASE_SHA=${BASE_SHA}
HEAD_SHA=${HEAD_SHA}
BASE_COMMIT_AVAILABLE=${BASE_COMMIT_AVAILABLE}
HEAD_COMMIT_AVAILABLE=${HEAD_COMMIT_AVAILABLE}
BASE_PROBE_RUN_ID=${BASE_PROBE_RUN_ID}
HEAD_PROBE_RUN_ID=${HEAD_PROBE_RUN_ID}
EOF

if [[ "$validation_exit" -ne 0 ]]; then
  cleanup
  exit "$validation_exit"
fi

cleanup
