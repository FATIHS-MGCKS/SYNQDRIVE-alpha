#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPARE="$ROOT/scripts/audits/compare-dependency-audit-baseline.js"
AUDIT_SCRIPT="$ROOT/scripts/audits/audit-dependencies.sh"
GRAPH_IDENTITY="$ROOT/scripts/audits/dependency-lock-graph-identity.sh"
FIXTURES="$ROOT/scripts/audits/fixtures/dependency-audit"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# shellcheck source=dependency-lock-graph-identity.sh
source "$GRAPH_IDENTITY"

mkdir -p "$FIXTURES"

# --- Case B fixtures: same vulnerable graph, different npm-audit representation (jest class) ---
write_fixture() {
  local name="$1"
  shift
  printf '%s\n' "$@" >"$FIXTURES/${name}.json"
}

write_fixture base-jest-string-via '{"metadata":{"vulnerabilities":{"high":1,"critical":0}},"vulnerabilities":{"jest":{"name":"jest","severity":"high","isDirect":false,"via":["jest-resolve-dependencies"],"range":"24.2.0-alpha.0 - 30.2.0","nodes":["node_modules/jest"]}}}'
write_fixture pr-jest-object-via '{"metadata":{"vulnerabilities":{"high":1,"critical":0}},"vulnerabilities":{"jest":{"name":"jest","severity":"high","isDirect":false,"via":[{"source":111,"name":"jest","url":"https://github.com/advisories/GHSA-jest-representation-test","severity":"high","range":"24.2.0-alpha.0 - 30.2.0"}],"range":"24.2.0-alpha.0 - 30.2.0","nodes":["node_modules/jest"]}}}'

write_fixture base-empty '{"metadata":{"vulnerabilities":{"high":0,"critical":0}},"vulnerabilities":{}}'
write_fixture pr-empty '{"metadata":{"vulnerabilities":{"high":0,"critical":0}},"vulnerabilities":{}}'

# Comparator still flags representation drift (documents need for lockfile short-circuit).
set +e
node "$COMPARE" \
  --base-backend "$FIXTURES/base-jest-string-via.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-jest-object-via.json" \
  --pr-frontend "$FIXTURES/pr-empty.json" >"$TMP/compare-drift.log" 2>&1
compare_drift_exit=$?
set -e
if [[ "$compare_drift_exit" -ne 1 ]]; then
  echo "FAIL expected comparator exit 1 on advisory representation drift, got ${compare_drift_exit}"
  cat "$TMP/compare-drift.log"
  exit 1
fi
echo "PASS comparator detects representation-only drift (exit=1) without lockfile short-circuit"

# --- A/B: identical lockfiles => graph identity NO ---
BASE_SHA="${GRAPH_IDENTITY_BASE_SHA:-813f4b91ae37695f93b431805bc9537a7d88f43f}"
HEAD_SHA="${GRAPH_IDENTITY_HEAD_SHA:-4ec99f2253082488b74cae939c61783c4c372303}"

git -C "$ROOT" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null || {
  echo "SKIP identical-graph replay: base commit ${BASE_SHA} not available"
  BASE_SHA=""
}
git -C "$ROOT" cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null || {
  echo "SKIP identical-graph replay: head commit ${HEAD_SHA} not available"
  HEAD_SHA=""
}

if [[ -n "$BASE_SHA" && -n "$HEAD_SHA" ]]; then
  mkdir -p "$TMP/base-archive" "$TMP/head-archive"
  git -C "$ROOT" archive "${BASE_SHA}" backend/package-lock.json frontend/package-lock.json | tar -x -C "$TMP/base-archive"
  git -C "$ROOT" archive "${HEAD_SHA}" backend/package-lock.json frontend/package-lock.json | tar -x -C "$TMP/head-archive"
  emit_dependency_graph_identity \
    "$TMP/base-archive/backend/package-lock.json" \
    "$TMP/head-archive/backend/package-lock.json" \
    "$TMP/base-archive/frontend/package-lock.json" \
    "$TMP/head-archive/frontend/package-lock.json" >"$TMP/identity.log"
  if ! grep -q 'DEPENDENCY_GRAPH_CHANGED=NO' "$TMP/identity.log"; then
    echo "FAIL PR #1895 replay: expected DEPENDENCY_GRAPH_CHANGED=NO"
    cat "$TMP/identity.log"
    exit 1
  fi
  echo "IDENTICAL_GRAPH_FALSE_POSITIVE_CONFIRMED=YES"

  set +e
  out="$(
    env \
      AUDIT_DEPENDENCIES_TEST_HARNESS=1 \
      PR_BASE_SHA="$BASE_SHA" \
      PR_HEAD_SHA="$HEAD_SHA" \
      bash "$AUDIT_SCRIPT" 2>&1
  )"
  audit_exit=$?
  set -e
  if [[ "$audit_exit" -ne 0 ]]; then
    echo "FAIL audit-dependencies identical graph short-circuit expected exit 0, got ${audit_exit}"
    echo "$out"
    exit 1
  fi
  if [[ "$out" != *"DEPENDENCY_GRAPH_CHANGED=NO"* ]] || [[ "$out" != *"SECURITY_REGRESSION=false"* ]]; then
    echo "FAIL audit-dependencies missing short-circuit markers"
    echo "$out"
    exit 1
  fi
  echo "IDENTICAL_GRAPH_FALSE_REGRESSION=PASS"
else
  echo "IDENTICAL_GRAPH_FALSE_REGRESSION=SKIP_MISSING_COMMITS"
fi

# --- C/D: changed lockfile surfaces ---
cp "$ROOT/backend/package-lock.json" "$TMP/backend-head.lock"
cp "$ROOT/backend/package-lock.json" "$TMP/backend-base.lock"
printf '\n' >>"$TMP/backend-head.lock"
emit_dependency_graph_identity \
  "$TMP/backend-base.lock" \
  "$TMP/backend-head.lock" \
  "$ROOT/frontend/package-lock.json" \
  "$ROOT/frontend/package-lock.json" >"$TMP/be-changed.log"
grep -q 'BACKEND_DEPENDENCY_GRAPH_CHANGED=YES' "$TMP/be-changed.log" || {
  echo "FAIL backend lock mutation should change graph"
  cat "$TMP/be-changed.log"
  exit 1
}
run_compare_backend_high() {
  set +e
  node "$COMPARE" \
    --base-backend "$FIXTURES/base-empty.json" \
    --base-frontend "$FIXTURES/base-empty.json" \
    --pr-backend "$FIXTURES/pr-add-high.json" \
    --pr-frontend "$FIXTURES/pr-empty.json" >"$TMP/out.log" 2>&1
  local code=$?
  set -e
  [[ "$code" -eq 1 ]]
}
run_compare_backend_high
echo "CHANGED_BACKEND_GRAPH_HIGH_TEST=PASS"

cp "$ROOT/frontend/package-lock.json" "$TMP/frontend-head.lock"
cp "$ROOT/frontend/package-lock.json" "$TMP/frontend-base.lock"
printf '\n' >>"$TMP/frontend-head.lock"
emit_dependency_graph_identity \
  "$ROOT/backend/package-lock.json" \
  "$ROOT/backend/package-lock.json" \
  "$TMP/frontend-base.lock" \
  "$TMP/frontend-head.lock" >"$TMP/fe-changed.log"
grep -q 'FRONTEND_DEPENDENCY_GRAPH_CHANGED=YES' "$TMP/fe-changed.log" || {
  echo "FAIL frontend lock mutation should change graph"
  exit 1
}
set +e
node "$COMPARE" \
  --base-backend "$FIXTURES/base-empty.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/base-empty.json" \
  --pr-frontend "$FIXTURES/pr-add-high.json" >"$TMP/fe-high.log" 2>&1
fe_high_exit=$?
set -e
[[ "$fe_high_exit" -eq 1 ]] || {
  echo "FAIL frontend new high compare exit"
  cat "$TMP/fe-high.log"
  exit 1
}
echo "CHANGED_FRONTEND_GRAPH_HIGH_TEST=PASS"

# E/F/G covered by test-dependency-audit-baseline-regression.sh (comparator + fail-closed)
echo "CHANGED_GRAPH_CRITICAL_TEST=PASS_DELEGATED"
echo "SEVERITY_ESCALATION_TEST=PASS_DELEGATED"
echo "MISSING_INPUT_FAIL_CLOSED_TEST=PASS_DELEGATED"

echo "GRAPH_IDENTITY_TESTS=PASS"
