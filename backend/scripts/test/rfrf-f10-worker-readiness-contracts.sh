#!/usr/bin/env bash
# RFRF F10.2.1.1 worker readiness contract tests — mocked HTTP only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="${SCRIPT_DIR}/../ops"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

fail() { echo "WORKER_CONTRACT_FAIL: $*" >&2; exit 1; }
pass() { echo "WORKER_CONTRACT_PASS: $*"; }

source "${OPS}/lib/rfrf-production-rollout.lib.sh"

HEALTHY='{"status":"ok","checks":{"redis":{"status":"ok"},"workers":{"status":"ok","details":{"workersEnabled":true}}}}'
WORKERS_DISABLED='{"status":"ok","checks":{"redis":{"status":"ok"},"workers":{"status":"ok","details":{"workersEnabled":false}}}}'
REDIS_UNHEALTHY='{"status":"ok","checks":{"redis":{"status":"error"},"workers":{"status":"ok","details":{"workersEnabled":true}}}}'
WORKERS_UNHEALTHY='{"status":"ok","checks":{"redis":{"status":"ok"},"workers":{"status":"error","details":{"workersEnabled":true}}}}'
READINESS_BAD='{"status":"degraded","checks":{"redis":{"status":"ok"},"workers":{"status":"ok","details":{"workersEnabled":true}}}}'
MALFORMED='not-json'

assert_no_undefined_labels() {
  local out="$1"
  if [[ "$out" == *"READINESS_undefined"* || "$out" == *"WORKERS_ENABLED_undefined"* ]]; then
    fail "undefined readiness labels present in output: ${out}"
  fi
}

run_worker_case() {
  local port="$1" fixture="$2" expect_rc="$3" label="$4"
  shift 4
  local out rc
  curl() {
    if [[ "$*" == *"/api/v1/health/readiness"* && "$*" == *":${port}/"* ]]; then
      printf '%s' "$fixture"
      return 0
    fi
    return 22
  }
  set +e
  out="$(rfrf_verify_worker_readiness "$port" 2>&1)"
  rc=$?
  set -e
  assert_no_undefined_labels "$out"
  if (( rc != expect_rc )); then
    fail "${label}: expected exit ${expect_rc}, got ${rc}; output=${out}"
  fi
  while (($#)); do
    local needle="$1"
    shift
    [[ "$out" == *"$needle"* ]] || fail "${label}: missing ${needle}; output=${out}"
  done
  pass "$label"
}

run_worker_case 3001 "$HEALTHY" 0 "healthy 3001" \
  "READINESS_3001=PASS" "REDIS_3001=ok" "WORKERS_3001=ok" "WORKERS_ENABLED_3001=yes" "WORKER_READINESS_3001=PASS"

run_worker_case 3002 "$HEALTHY" 0 "healthy 3002" \
  "READINESS_3002=PASS" "REDIS_3002=ok" "WORKERS_3002=ok" "WORKERS_ENABLED_3002=yes" "WORKER_READINESS_3002=PASS"

run_worker_case 3001 "$WORKERS_DISABLED" 1 "workers disabled" "WORKERS_ENABLED_3001=no"
run_worker_case 3001 "$REDIS_UNHEALTHY" 1 "redis unhealthy" "REDIS_3001=error"
run_worker_case 3001 "$WORKERS_UNHEALTHY" 1 "workers unhealthy" "WORKERS_3001=error"
run_worker_case 3001 "$READINESS_BAD" 1 "readiness not ok" "READINESS_3001=BLOCKED"
run_worker_case 3001 "$MALFORMED" 1 "malformed json" "READINESS_3001=BLOCKED"

curl() { return 22; }
set +e
unreachable_out="$(rfrf_verify_worker_readiness 3001 2>&1)"
unreachable_rc=$?
set -e
assert_no_undefined_labels "$unreachable_out"
(( unreachable_rc == 1 )) || fail "unreachable should exit 1"
[[ "$unreachable_out" == *"WORKER_READINESS_3001=UNREACHABLE"* ]] || fail "unreachable output missing"
pass "unreachable readiness"

curl() {
  if [[ "$*" == *":3001/api/v1/health/readiness"* ]]; then
    printf '%s' "$HEALTHY"
    return 0
  fi
  if [[ "$*" == *":3002/api/v1/health/readiness"* ]]; then
    printf '%s' "$HEALTHY"
    return 0
  fi
  return 22
}
set +e
dual_out="$(rfrf_verify_dual_replica_worker_readiness 2>&1)"
dual_rc=$?
set -e
assert_no_undefined_labels "$dual_out"
(( dual_rc == 0 )) || fail "dual healthy gate should pass; output=${dual_out}"
[[ "$dual_out" == *"REDIS_WORKER_READINESS_GATE=PASS"* ]] || fail "dual gate missing PASS marker"
pass "dual replica healthy gate"

grep -q 'process.argv\[1\]' "${OPS}/lib/rfrf-production-rollout.lib.sh" || fail "worker readiness must pass port via node argv"
! grep -q 'process.env.PORT' "${OPS}/lib/rfrf-production-rollout.lib.sh" || fail "worker readiness must not rely on pipeline-scoped PORT env"
! grep -q 'pass="\$(PORT=' "${OPS}/lib/rfrf-production-rollout.lib.sh" || fail "worker readiness must not capture multiline stdout into pass var"
pass "worker readiness implementation uses argv + exit status"

echo "rfrf-f10-worker-readiness-contracts: OK"
