#!/usr/bin/env bash
# Regression harness for i18n authority path classification (self-contained).
# Does NOT source any repository runtime helper — functions are isolated copies
# extracted from .github/workflows/i18n-authority-protection.yml.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORKFLOW="${REPO_ROOT}/.github/workflows/i18n-authority-protection.yml"

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_TESTS=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo "PASS: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo "FAIL: $1" >&2
  exit 1
}

# --- Isolated copies of workflow inline classifier helpers (not sourced from repo) ---

is_authority_path() {
  local path="$1"
  case "$path" in
    .github/workflows/*)
      return 0
      ;;
    frontend/scripts/i18n-hardcoded-scan.mjs|frontend/scripts/i18n-check.mjs|frontend/scripts/i18n-governance.mjs|frontend/scripts/i18n-pr-gate.mjs|frontend/scripts/i18n-shim-inventory.mjs)
      return 0
      ;;
    frontend/scripts/lib/i18n-governance/*)
      return 0
      ;;
    frontend/package.json|frontend/package-lock.json)
      return 0
      ;;
    frontend/src/i18n/i18n-debt-classifications.json|frontend/src/i18n/i18n-pr-gate.test.ts|frontend/src/i18n/i18n-governance-scanner.test.ts|frontend/src/i18n/translation-registry.test.ts|frontend/src/i18n/locales.test.ts|frontend/src/i18n/i18n-structural-check.test.ts|frontend/src/i18n/hardcoded-copy-guard.test.ts|frontend/src/i18n/translation-coverage-baseline.json|frontend/src/i18n/translation-coverage.test.ts)
      return 0
      ;;
  esac
  return 1
}

is_product_or_presentation_path() {
  local path="$1"
  case "$path" in
    frontend/src/*)
      if is_authority_path "$path"; then
        return 1
      fi
      return 0
      ;;
  esac
  return 1
}

classify_paths() {
  AUTHORITY_CHANGED=false
  PRODUCT_OR_PRESENTATION_CHANGED=false
  AUTHORITY_PATH_COUNT=0
  PRODUCT_OR_PRESENTATION_PATH_COUNT=0
  AUTHORITY_PATHS_REPORT=""
  PRODUCT_PATHS_REPORT=""

  for path in "$@"; do
    if is_authority_path "$path"; then
      AUTHORITY_CHANGED=true
      AUTHORITY_PATH_COUNT=$((AUTHORITY_PATH_COUNT + 1))
      if [ -z "$AUTHORITY_PATHS_REPORT" ]; then
        AUTHORITY_PATHS_REPORT="$path"
      else
        AUTHORITY_PATHS_REPORT="${AUTHORITY_PATHS_REPORT},${path}"
      fi
    fi
    if is_product_or_presentation_path "$path"; then
      PRODUCT_OR_PRESENTATION_CHANGED=true
      PRODUCT_OR_PRESENTATION_PATH_COUNT=$((PRODUCT_OR_PRESENTATION_PATH_COUNT + 1))
      if [ -z "$PRODUCT_PATHS_REPORT" ]; then
        PRODUCT_PATHS_REPORT="$path"
      else
        PRODUCT_PATHS_REPORT="${PRODUCT_PATHS_REPORT},${path}"
      fi
    fi
  done
}

evaluate_authority_gate() {
  local event_action="$1"
  local authority_label_present="$2"
  local trusted_sender="$3"

  classify_paths "${@:4}"

  if [ "$AUTHORITY_CHANGED" = false ]; then
    RESULT=PASS
    REASON=NO_GOVERNANCE_AUTHORITY_CHANGE
    return 0
  fi

  if [ "$PRODUCT_OR_PRESENTATION_CHANGED" = true ]; then
    RESULT=FAIL
    REASON=MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE
    return 1
  fi

  if [ "${event_action}" = "labeled" ] && [ "${authority_label_present}" = true ] && [ "${trusted_sender}" = "FATIHS-MGCKS" ]; then
    RESULT=PASS
    REASON=GOVERNANCE_AUTHORITY_APPROVED
    return 0
  fi

  RESULT=FAIL
  REASON=GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL
  return 1
}

extract_workflow_authority_case_line() {
  awk '
    /is_authority_path\(\) \{/ { in_fn=1; next }
    in_fn && /frontend\/src\/i18n\// {
      sub(/^[[:space:]]+/, "", $0)
      sub(/\)$/, "", $0)
      print $0
      exit
    }
  ' "${WORKFLOW}"
}

# --- Test 1: workflow classifier includes translation coverage governance paths ---
echo "==> 1. workflow classifier includes translation coverage governance paths"
CASE_LINE="$(extract_workflow_authority_case_line)"
[[ -n "${CASE_LINE}" ]] || fail "unable to extract workflow authority case line"
[[ "${CASE_LINE}" == *"frontend/src/i18n/translation-coverage-baseline.json"* ]] || fail "missing translation-coverage-baseline.json in workflow classifier"
[[ "${CASE_LINE}" == *"frontend/src/i18n/translation-coverage.test.ts"* ]] || fail "missing translation-coverage.test.ts in workflow classifier"
pass "workflow classifier includes translation coverage governance paths"

# --- Test 2: PR #1581 authority paths classify as authority-only ---
echo "==> 2. PR #1581 authority paths classify as authority-only"
classify_paths \
  "frontend/src/i18n/i18n-structural-check.test.ts" \
  "frontend/src/i18n/translation-coverage-baseline.json" \
  "frontend/src/i18n/translation-coverage.test.ts"
[[ "$AUTHORITY_CHANGED" == true ]] || fail "expected authority change"
[[ "$AUTHORITY_PATH_COUNT" -eq 3 ]] || fail "expected 3 authority paths, got ${AUTHORITY_PATH_COUNT}"
[[ "$PRODUCT_OR_PRESENTATION_CHANGED" == false ]] || fail "expected no product paths, got ${PRODUCT_PATHS_REPORT}"
pass "PR #1581 authority paths classify as authority-only"

# --- Test 3: real product code still fails mixed-change guard ---
echo "==> 3. real product code still fails mixed-change guard"
if evaluate_authority_gate opened false "" \
  "frontend/src/i18n/translation-coverage-baseline.json" \
  "frontend/src/rental/components/TopBar.tsx"; then
  fail "expected mixed-change failure"
else
  [[ "${REASON}" == "MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE" ]] || fail "expected MIXED reason, got ${REASON}"
  pass "mixed authority + product change fails closed"
fi

# --- Test 4: owner approval remains required for authority-only change ---
echo "==> 4. owner approval remains required for authority-only change"
if evaluate_authority_gate opened false "" \
  "frontend/src/i18n/translation-coverage.test.ts"; then
  fail "expected approval-required failure"
else
  [[ "${REASON}" == "GOVERNANCE_AUTHORITY_CHANGE_REQUIRES_APPROVAL" ]] || fail "expected approval-required reason, got ${REASON}"
  pass "authority-only change requires owner approval"
fi

# --- Test 5: trusted owner label approval passes authority-only change ---
echo "==> 5. trusted owner label approval passes authority-only change"
if evaluate_authority_gate labeled true FATIHS-MGCKS \
  "frontend/src/i18n/i18n-structural-check.test.ts" \
  "frontend/src/i18n/translation-coverage-baseline.json" \
  "frontend/src/i18n/translation-coverage.test.ts"; then
  [[ "${REASON}" == "GOVERNANCE_AUTHORITY_APPROVED" ]] || fail "expected approved reason, got ${REASON}"
  pass "trusted owner label approves authority-only change"
else
  fail "expected trusted owner approval to pass"
fi

# --- Test 6: no checkout in trusted workflow ---
echo "==> 6. no checkout in trusted workflow"
CHECKOUT_COUNT="$(grep -c 'uses:.*actions/checkout' "${WORKFLOW}" 2>/dev/null || true)"
[[ "${CHECKOUT_COUNT}" -eq 0 ]] || fail "actions/checkout present (count=${CHECKOUT_COUNT})"
pass "no actions/checkout in trusted workflow"

# --- Test 7: no repository runtime helper dependency ---
echo "==> 7. no repository runtime helper dependency"
if grep -qE '(source|\. )[[:space:]]*.*\.github/scripts/' "${WORKFLOW}"; then
  fail "workflow sources .github/scripts runtime helper"
fi
pass "no repository runtime helper dependency"

echo ""
echo "Harness complete: ${PASS_COUNT}/${TOTAL_TESTS} tests passed, ${FAIL_COUNT} failures"
[[ "${PASS_COUNT}" -eq "${TOTAL_TESTS}" ]] || fail "expected ${TOTAL_TESTS} passing tests, got ${PASS_COUNT}"
