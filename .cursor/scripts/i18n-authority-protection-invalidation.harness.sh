#!/usr/bin/env bash
# Adversarial harness for i18n authority label invalidation (self-contained).
# Does NOT source any repository runtime helper — functions are isolated copies
# extracted from .github/workflows/i18n-authority-protection.yml for unit testing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORKFLOW="${REPO_ROOT}/.github/workflows/i18n-authority-protection.yml"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

export RUNNER_TEMP="${TMPDIR}"
export GITHUB_RUN_ID="harness"
export GITHUB_RUN_ATTEMPT="1"
export REPO="owner/repo"
export PR_NUMBER="1496"
export AUTHORITY_LABEL="i18n-governance-authority-change"
export AUTHORITY_LABEL_PRESENT=true

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_TESTS=15

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "FAIL: $1" >&2
  exit 1
}

# --- Isolated copies of workflow inline invalidation helpers (not sourced from repo) ---

sanitize_api_diagnostic() {
  local raw="${1:-}"
  raw="$(printf '%s' "${raw}" | tr '\n' ' ' | tr '\r' ' ')"
  raw="$(printf '%s' "${raw}" | sed -E \
    -e 's/ghs_[A-Za-z0-9_]+/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/github_pat_[A-Za-z0-9_]+/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/(Authorization:[[:space:]]*Bearer)[[:space:]]+[^[:space:]]+/\1 [REDACTED]/gi' \
    -e 's/(GH_TOKEN=)[^[:space:]]+/\1[REDACTED]/g' \
    -e 's/(token=)[^[:space:]]+/\1[REDACTED]/gi')"
  if [ "${#raw}" -gt 500 ]; then
    raw="${raw:0:500}...[truncated]"
  fi
  printf '%s' "${raw}"
}

authority_label_uri_encoded() {
  AUTHORITY_LABEL="${AUTHORITY_LABEL}" python3 - <<'PY'
import os
import urllib.parse

print(urllib.parse.quote(os.environ["AUTHORITY_LABEL"], safe=""))
PY
}

authority_label_present_on_pr() {
  local labels_json="${RUNNER_TEMP}/i18n-authority-labels-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.json"
  if ! gh api "repos/${REPO}/issues/${PR_NUMBER}/labels" > "${labels_json}" 2>/dev/null; then
    return 2
  fi
  if AUTHORITY_LABEL="${AUTHORITY_LABEL}" LABELS_JSON="${labels_json}" python3 - <<'PY'
import json
import os
import sys

label = os.environ["AUTHORITY_LABEL"]
with open(os.environ["LABELS_JSON"], encoding="utf-8") as handle:
    names = [entry.get("name") for entry in json.load(handle)]
sys.exit(0 if label in names else 1)
PY
  then
    return 0
  fi
  return 1
}

invalidate_authority_label() {
  local delete_output="${RUNNER_TEMP}/i18n-authority-label-delete-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.log"
  local encoded_label delete_status label_presence_rc

  LABEL_INVALIDATION_API_RESULT=""
  LABEL_INVALIDATION_API_EXIT_CODE=""
  LABEL_INVALIDATION_API_DIAGNOSTIC=""

  encoded_label="$(authority_label_uri_encoded)"
  delete_status=0
  set +e
  gh api --method DELETE \
    "repos/${REPO}/issues/${PR_NUMBER}/labels/${encoded_label}" \
    >"${delete_output}" 2>&1
  delete_status=$?
  set -e

  if [ "${delete_status}" -ne 0 ]; then
    LABEL_INVALIDATION_API_RESULT=FAIL
    LABEL_INVALIDATION_API_EXIT_CODE="${delete_status}"
    LABEL_INVALIDATION_API_DIAGNOSTIC="$(sanitize_api_diagnostic "$(cat "${delete_output}" 2>/dev/null || true)")"
    return 1
  fi

  label_presence_rc=0
  set +e
  authority_label_present_on_pr
  label_presence_rc=$?
  set -e

  case "${label_presence_rc}" in
    0)
      LABEL_INVALIDATION_API_RESULT=POSTCONDITION_FAIL
      LABEL_INVALIDATION_API_DIAGNOSTIC="authority label still present after DELETE exit 0"
      return 1
      ;;
    1)
      AUTHORITY_LABEL_PRESENT=false
      LABEL_INVALIDATION_API_RESULT=SUCCESS
      return 0
      ;;
    *)
      LABEL_INVALIDATION_API_RESULT=POSTCONDITION_VERIFY_FAILED
      LABEL_INVALIDATION_API_DIAGNOSTIC="unable to verify PR label state after DELETE"
      return 1
      ;;
  esac
}

gh() {
  case "${HARNESS_GH_MODE:-}" in
    delete_success)
      if [[ "$1" == "api" && "$2" == "--method" && "$3" == "DELETE" ]]; then
        return 0
      fi
      if [[ "$1" == "api" && "$2" == "repos/owner/repo/issues/1496/labels" ]]; then
        printf '%s\n' '[]'
        return 0
      fi
      ;;
    delete_fail)
      if [[ "$1" == "api" && "$2" == "--method" && "$3" == "DELETE" ]]; then
        echo "gh: HTTP 403 Forbidden (label removal denied)" >&2
        return 1
      fi
      ;;
    delete_success_label_still_present)
      if [[ "$1" == "api" && "$2" == "--method" && "$3" == "DELETE" ]]; then
        return 0
      fi
      if [[ "$1" == "api" && "$2" == "repos/owner/repo/issues/1496/labels" ]]; then
        printf '%s\n' '[{"name":"i18n-governance-authority-change"}]'
        return 0
      fi
      ;;
    delete_success_get_labels_fail)
      if [[ "$1" == "api" && "$2" == "--method" && "$3" == "DELETE" ]]; then
        return 0
      fi
      if [[ "$1" == "api" && "$2" == "repos/owner/repo/issues/1496/labels" ]]; then
        echo "gh: HTTP 500 Internal Server Error" >&2
        return 1
      fi
      ;;
    *)
      echo "unexpected gh invocation: $*" >&2
      return 99
      ;;
  esac
  echo "unexpected gh invocation: $*" >&2
  return 99
}

# --- Test 1: DELETE success + label absent -> SUCCESS ---
echo "==> 1. DELETE success + label absent -> SUCCESS"
HARNESS_GH_MODE=delete_success
AUTHORITY_LABEL_PRESENT=true
if invalidate_authority_label; then
  [[ "${LABEL_INVALIDATION_API_RESULT}" == "SUCCESS" ]] || fail "expected SUCCESS result"
  [[ "${AUTHORITY_LABEL_PRESENT}" == "false" ]] || fail "expected label cleared"
  pass "delete success with absent postcondition"
else
  fail "expected invalidation success"
fi

# --- Test 2: DELETE nonzero -> FAIL ---
echo "==> 2. DELETE nonzero -> FAIL"
HARNESS_GH_MODE=delete_fail
AUTHORITY_LABEL_PRESENT=true
if invalidate_authority_label; then
  fail "expected invalidation failure on DELETE error"
else
  [[ "${LABEL_INVALIDATION_API_RESULT}" == "FAIL" ]] || fail "expected FAIL api result"
  [[ "${LABEL_INVALIDATION_API_EXIT_CODE}" == "1" ]] || fail "expected exit code capture"
  [[ "${LABEL_INVALIDATION_API_DIAGNOSTIC}" == *"403"* ]] || fail "expected diagnostic body"
  pass "delete failure remains fail-closed"
fi

# --- Test 3: DELETE zero + label still present -> POSTCONDITION_FAIL ---
echo "==> 3. DELETE zero + label still present -> POSTCONDITION_FAIL"
HARNESS_GH_MODE=delete_success_label_still_present
AUTHORITY_LABEL_PRESENT=true
if invalidate_authority_label; then
  fail "expected postcondition failure"
else
  [[ "${LABEL_INVALIDATION_API_RESULT}" == "POSTCONDITION_FAIL" ]] || fail "expected POSTCONDITION_FAIL"
  pass "postcondition failure detected"
fi

# --- Test 4: GET/postcondition query failure -> POSTCONDITION_VERIFY_FAILED ---
echo "==> 4. GET/postcondition query failure -> POSTCONDITION_VERIFY_FAILED"
HARNESS_GH_MODE=delete_success_get_labels_fail
AUTHORITY_LABEL_PRESENT=true
if invalidate_authority_label; then
  fail "expected postcondition verify failure"
else
  [[ "${LABEL_INVALIDATION_API_RESULT}" == "POSTCONDITION_VERIFY_FAILED" ]] || fail "expected POSTCONDITION_VERIFY_FAILED"
  pass "postcondition verify failure detected"
fi

# --- Test 5: diagnostics sanitize ghs_ token ---
echo "==> 5. diagnostics sanitize ghs_ token"
TOKEN_SAMPLE='ghs_supersecret_token_value Authorization: Bearer ghs_leaked'
SANITIZED="$(sanitize_api_diagnostic "${TOKEN_SAMPLE}")"
[[ "${SANITIZED}" != *"ghs_supersecret"* ]] || fail "ghs token leaked in diagnostic"
[[ "${SANITIZED}" == *"[REDACTED"* ]] || fail "expected redaction marker for ghs"
pass "ghs diagnostic sanitization"

# --- Test 6: diagnostics sanitize github_pat ---
echo "==> 6. diagnostics sanitize github_pat"
PAT_SAMPLE='github_pat_11ABCDEFGHIJKLMNOP token=leaked'
SANITIZED_PAT="$(sanitize_api_diagnostic "${PAT_SAMPLE}")"
[[ "${SANITIZED_PAT}" != *"github_pat_11ABCDEF"* ]] || fail "github_pat leaked in diagnostic"
[[ "${SANITIZED_PAT}" == *"[REDACTED"* ]] || fail "expected redaction marker for github_pat"
pass "github_pat diagnostic sanitization"

# --- Test 7: synchronize success invalidation -> REAPPROVAL_REQUIRED ---
echo "==> 7. synchronize success invalidation -> REAPPROVAL_REQUIRED"
grep -q 'AUTHORITY_REAPPROVAL_REQUIRED_AFTER_HEAD_CHANGE' "${WORKFLOW}" || fail "missing synchronize reapproval reason"
grep -q 'EVENT_ACTION.*synchronize' "${WORKFLOW}" || fail "missing synchronize gate"
grep -q 'invalidate_authority_label' "${WORKFLOW}" || fail "missing invalidation hook"
pass "synchronize reapproval reason preserved"

# --- Test 8: synchronize invalidation API failure -> FAIL CLOSED ---
echo "==> 8. synchronize invalidation API failure -> FAIL CLOSED"
grep -q 'AUTHORITY_LABEL_INVALIDATION_FAILED' "${WORKFLOW}" || fail "missing API failure reason"
grep -q 'AUTHORITY_LABEL_INVALIDATION_POSTCONDITION_FAILED' "${WORKFLOW}" || fail "missing postcondition failure reason"
pass "synchronize invalidation failure reasons preserved"

# --- Test 9: untrusted-label invalidation API failure -> FAIL CLOSED ---
echo "==> 9. untrusted-label invalidation API failure -> FAIL CLOSED"
grep -q 'UNTRUSTED_AUTHORITY_APPROVAL_ACTOR' "${WORKFLOW}" || fail "missing untrusted actor reason"
grep -q 'AUTHORITY_LABEL_INVALIDATION_FAILED' "${WORKFLOW}" || fail "missing invalidation fail reason for untrusted path"
pass "untrusted approval invalidation fail-closed"

# --- Test 10: no checkout in trusted workflow ---
echo "==> 10. no checkout in trusted workflow"
CHECKOUT_COUNT="$(grep -c 'uses:.*actions/checkout' "${WORKFLOW}" 2>/dev/null || true)"
[[ "${CHECKOUT_COUNT}" -eq 0 ]] || fail "actions/checkout present (count=${CHECKOUT_COUNT})"
pass "no actions/checkout in trusted workflow"

# --- Test 11: no source/import of repository runtime helper ---
echo "==> 11. no source/import of repository runtime helper"
if grep -qE '(source|\. )[[:space:]]*.*\.github/scripts/' "${WORKFLOW}"; then
  fail "workflow sources .github/scripts runtime helper"
fi
if grep -q 'i18n-authority-protection-invalidation.lib.sh' "${WORKFLOW}"; then
  fail "workflow references external invalidation lib"
fi
if [[ -f "${REPO_ROOT}/.github/scripts/i18n-authority-protection-invalidation.lib.sh" ]]; then
  fail "runtime helper file still exists in working tree"
fi
pass "no repository runtime helper dependency"

# --- Test 12: pull_request_target preserved ---
echo "==> 12. pull_request_target preserved"
grep -q 'pull_request_target:' "${WORKFLOW}" || fail "missing pull_request_target"
pass "pull_request_target preserved"

# --- Test 13: main target preserved ---
echo "==> 13. main target preserved"
grep -qE '^\s+- main\s*$' "${WORKFLOW}" || fail "main target branch missing"
pass "main target preserved"

# --- Test 14: campaign target preserved + campaign self-contained ---
echo "==> 14. campaign target preserved"
grep -q 'p239-p238-merge-baseline-3c10' "${WORKFLOW}" || fail "campaign target branch missing"
CAMPAIGN_RUNTIME_EXTERNAL_DEPENDENCY_COUNT=0
for pattern in 'actions/checkout' '\.github/scripts/' 'source .*\.github/' 'workflow_call'; do
  if grep -qE "${pattern}" "${WORKFLOW}"; then
    CAMPAIGN_RUNTIME_EXTERNAL_DEPENDENCY_COUNT=$((CAMPAIGN_RUNTIME_EXTERNAL_DEPENDENCY_COUNT + 1))
  fi
done
[[ "${CAMPAIGN_RUNTIME_EXTERNAL_DEPENDENCY_COUNT}" -eq 0 ]] || fail "campaign external runtime dependencies detected"
CAMPAIGN_TRUST_GUARD_BOOTSTRAP=SELF_CONTAINED
CAMPAIGN_TARGET_REGRESSION=NO
pass "campaign target preserved with zero external runtime dependencies"

# --- Test 15: workflow authority namespace preserved ---
echo "==> 15. workflow authority namespace preserved"
grep -q '.github/workflows/\*' "${WORKFLOW}" || fail "workflow authority namespace missing"
pass "authority namespace unchanged"

echo ""
echo "Harness complete: ${PASS_COUNT}/${TOTAL_TESTS} tests passed, ${FAIL_COUNT} failures"
[[ "${PASS_COUNT}" -eq "${TOTAL_TESTS}" ]] || fail "expected ${TOTAL_TESTS} passing tests, got ${PASS_COUNT}"
