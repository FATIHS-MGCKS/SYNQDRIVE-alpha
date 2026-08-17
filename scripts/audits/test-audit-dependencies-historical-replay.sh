#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUDIT_SCRIPT="$ROOT/scripts/audits/audit-dependencies.sh"

E7_BEFORE=06bae11f37a1843836dedf6a4cfcab0eb2fe37a5
E7_HEAD=bd732a8f7a6467565a8668ea136e81b79a04666a
E8_BEFORE=bd732a8f7a6467565a8668ea136e81b79a04666a
E8_HEAD=83b140b5c2be591c65058293052468e358b2eba3

assert_no_lockfile_delta() {
  local base="$1"
  local head="$2"
  local label="$3"
  if git -C "$ROOT" diff --name-only "$base" "$head" -- \
    backend/package-lock.json frontend/package-lock.json | grep -q .; then
    echo "FAIL ${label}: unexpected package-lock delta"
    exit 1
  fi
  echo "PASS ${label}: PACKAGE_LOCKFILES_CHANGED=0"
}

assert_no_manifest_or_lock_delta() {
  local base="$1"
  local head="$2"
  local label="$3"
  if git -C "$ROOT" diff --name-only "$base" "$head" -- \
    backend/package.json backend/package-lock.json \
    frontend/package.json frontend/package-lock.json | grep -q .; then
    echo "FAIL ${label}: unexpected package manifest/lockfile delta"
    exit 1
  fi
  echo "PASS ${label}: PACKAGE_MANIFESTS_CHANGED=0 PACKAGE_LOCKFILES_CHANGED=0"
}

run_push_replay() {
  local before="$1"
  local head="$2"
  local label="$3"
  assert_no_lockfile_delta "$before" "$head" "$label"

  set +e
  local out
  out="$(
    env \
      GITHUB_EVENT_NAME=push \
      PUSH_BEFORE_SHA="$before" \
      PR_HEAD_SHA="$head" \
      bash "$AUDIT_SCRIPT" 2>&1
  )"
  local code=$?
  set -e

  if [[ "$code" -ne 0 ]]; then
    echo "FAIL ${label}: expected baseline audit PASS, exit ${code}"
    echo "$out"
    exit 1
  fi
  if [[ "$out" != *"SECURITY_GATE_MODE=BASELINE_REGRESSION_FAIL_CLOSED"* ]]; then
    echo "FAIL ${label}: missing baseline regression mode"
    echo "$out"
    exit 1
  fi
  if [[ "$out" != *"SECURITY_REGRESSION=false"* ]] && [[ "$out" != *"Dependency baseline regression gate passed."* ]]; then
    echo "FAIL ${label}: expected no dependency regression"
    echo "$out"
    exit 1
  fi
  echo "PASS ${label}: DEPENDENCY_REGRESSION=false"
}

assert_no_lockfile_delta "$E7_BEFORE" "$E7_HEAD" "E7 main push"
assert_no_manifest_or_lock_delta "$E8_BEFORE" "$E8_HEAD" "E8 main push"

if [[ "${SKIP_HISTORICAL_NPM_REPLAY:-0}" == "1" ]]; then
  echo "SKIP_HISTORICAL_NPM_REPLAY=1 (lockfile delta checks only)"
  exit 0
fi

run_push_replay "$E7_BEFORE" "$E7_HEAD" "E7 historical npm replay"
run_push_replay "$E8_BEFORE" "$E8_HEAD" "E8 historical npm replay"

echo "E7_BASELINE_DEPENDENCY_REGRESSION=PASS"
echo "E8_BASELINE_DEPENDENCY_REGRESSION=PASS"
