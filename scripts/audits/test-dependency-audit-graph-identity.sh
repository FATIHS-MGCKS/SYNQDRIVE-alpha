#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPARE="$ROOT/scripts/audits/compare-dependency-audit-baseline.js"
AUDIT_SCRIPT="$ROOT/scripts/audits/audit-dependencies.sh"
VALIDATE_JSON="$ROOT/scripts/audits/validate-npm-audit-json.js"
GRAPH_IDENTITY="$ROOT/scripts/audits/dependency-lock-graph-identity.sh"
FIXTURES="$ROOT/scripts/audits/fixtures/dependency-audit"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# shellcheck source=dependency-lock-graph-identity.sh
source "$GRAPH_IDENTITY"

mkdir -p "$FIXTURES"

write_fixture() {
  local name="$1"
  shift
  printf '%s\n' "$@" >"$FIXTURES/${name}.json"
}

write_fixture base-jest-string-via '{"metadata":{"vulnerabilities":{"high":1,"critical":0}},"vulnerabilities":{"jest":{"name":"jest","severity":"high","isDirect":false,"via":["jest-resolve-dependencies"],"range":"24.2.0-alpha.0 - 30.2.0","nodes":["node_modules/jest"]}}}'
write_fixture pr-jest-object-via '{"metadata":{"vulnerabilities":{"high":1,"critical":0}},"vulnerabilities":{"jest":{"name":"jest","severity":"high","isDirect":false,"via":[{"source":111,"name":"jest","url":"https://github.com/advisories/GHSA-jest-representation-test","severity":"high","range":"24.2.0-alpha.0 - 30.2.0"}],"range":"24.2.0-alpha.0 - 30.2.0","nodes":["node_modules/jest"]}}}'

write_fixture base-empty '{"metadata":{"vulnerabilities":{"high":0,"critical":0}},"vulnerabilities":{}}'
write_fixture pr-empty '{"metadata":{"vulnerabilities":{"high":0,"critical":0}},"vulnerabilities":{}}'

run_identical_graph_audit() {
  local inject_backend="$1"
  local inject_frontend="$2"
  env \
    AUDIT_DEPENDENCIES_TEST_HARNESS=1 \
    AUDIT_DEPENDENCIES_INJECT_HEAD_BACKEND_AUDIT="$inject_backend" \
    AUDIT_DEPENDENCIES_INJECT_HEAD_FRONTEND_AUDIT="$inject_frontend" \
    PR_BASE_SHA="$BASE_SHA" \
    PR_HEAD_SHA="$HEAD_SHA" \
    bash "$AUDIT_SCRIPT" 2>&1
}

# --- B: representation drift fails comparator only ---
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

BASE_SHA="${GRAPH_IDENTITY_BASE_SHA:-813f4b91ae37695f93b431805bc9537a7d88f43f}"
HEAD_SHA="${GRAPH_IDENTITY_HEAD_SHA:-4ec99f2253082488b74cae939c61783c4c372303}"

git -C "$ROOT" cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null || BASE_SHA=""
git -C "$ROOT" cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null || HEAD_SHA=""

if [[ -z "$BASE_SHA" || -z "$HEAD_SHA" ]]; then
  echo "FAIL missing replay commits for identical-graph audit-dependencies tests"
  exit 1
fi

# --- A: identical graph + valid audit JSON ---
out="$(run_identical_graph_audit "$FIXTURES/pr-empty.json" "$FIXTURES/pr-empty.json")"
if [[ "$out" != *"DEPENDENCY_GRAPH_CHANGED=NO"* ]] || [[ "$out" != *"SECURITY_REGRESSION=false"* ]]; then
  echo "FAIL identical graph valid JSON"
  echo "$out"
  exit 1
fi
echo "IDENTICAL_GRAPH_VALID_JSON_TEST=PASS"

# --- B: identical graph + representation drift fixtures (short-circuit, not comparator) ---
out="$(run_identical_graph_audit "$FIXTURES/pr-jest-object-via.json" "$FIXTURES/pr-empty.json")"
if [[ "$out" != *"SECURITY_REGRESSION=false"* ]]; then
  echo "FAIL identical graph representation drift should PASS via lockfile short-circuit"
  echo "$out"
  exit 1
fi
echo "IDENTICAL_GRAPH_REPRESENTATION_DRIFT_TEST=PASS"

# --- C: identical graph + malformed HEAD audit JSON ---
printf 'not-json' >"$TMP/malformed-backend-audit.json"
set +e
out="$(run_identical_graph_audit "$TMP/malformed-backend-audit.json" "$FIXTURES/pr-empty.json")"
malformed_exit=$?
set -e
if [[ "$malformed_exit" -ne 2 ]] || [[ "$out" != *"FAIL_CLOSED"* ]]; then
  echo "FAIL identical graph malformed JSON expected exit 2 fail-closed, got ${malformed_exit}"
  echo "$out"
  exit 1
fi
echo "IDENTICAL_GRAPH_MALFORMED_JSON_TEST=PASS"

# --- F: missing lockfile ---
set +e
missing_out="$(emit_dependency_graph_identity "$TMP/missing.lock" "$ROOT/backend/package-lock.json" "$ROOT/frontend/package-lock.json" "$ROOT/frontend/package-lock.json" 2>&1)"
missing_exit=$?
set -e
if [[ "$missing_exit" -ne 2 ]] || [[ "$missing_out" != *"FAIL_CLOSED"* ]]; then
  echo "FAIL missing lockfile expected exit 2"
  echo "$missing_out"
  exit 1
fi
echo "MISSING_LOCKFILE_FAIL_CLOSED_TEST=PASS"

# --- D/E: changed graph (comparator) ---
set +e
node "$COMPARE" \
  --base-backend "$FIXTURES/base-empty.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-add-high.json" \
  --pr-frontend "$FIXTURES/pr-empty.json" >"$TMP/high.log" 2>&1
high_exit=$?
set -e
[[ "$high_exit" -eq 1 ]] || { echo "FAIL changed graph high"; exit 1; }
echo "CHANGED_GRAPH_HIGH_TEST=PASS"

set +e
node "$COMPARE" \
  --base-backend "$FIXTURES/base-empty.json" \
  --base-frontend "$FIXTURES/base-empty.json" \
  --pr-backend "$FIXTURES/pr-add-critical.json" \
  --pr-frontend "$FIXTURES/pr-empty.json" >"$TMP/crit.log" 2>&1
crit_exit=$?
set -e
[[ "$crit_exit" -eq 1 ]] || { echo "FAIL changed graph critical"; exit 1; }
echo "CHANGED_GRAPH_CRITICAL_TEST=PASS"

# validate-npm-audit-json direct checks
node "$VALIDATE_JSON" "$FIXTURES/pr-empty.json"
set +e
node "$VALIDATE_JSON" "$TMP/malformed-backend-audit.json" 2>"$TMP/val-err.log"
val_exit=$?
set -e
[[ "$val_exit" -eq 2 ]] || exit 1

echo "GRAPH_IDENTITY_TESTS=PASS"
