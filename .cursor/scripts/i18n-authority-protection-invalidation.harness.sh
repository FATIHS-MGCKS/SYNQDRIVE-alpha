#!/usr/bin/env bash
# Adversarial harness for i18n authority label invalidation helpers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LIB="${REPO_ROOT}/.github/scripts/i18n-authority-protection-invalidation.lib.sh"

if [[ ! -f "${LIB}" ]]; then
  echo "missing library: ${LIB}" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "${LIB}"

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

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "FAIL: $1" >&2
  exit 1
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
    *)
      echo "unexpected gh invocation: $*" >&2
      return 99
      ;;
  esac
  echo "unexpected gh invocation: $*" >&2
  return 99
}

echo "==> 1. DELETE success + label absent -> invalidation success"
HARNESS_GH_MODE=delete_success
AUTHORITY_LABEL_PRESENT=true
if invalidate_authority_label; then
  [[ "${LABEL_INVALIDATION_API_RESULT}" == "SUCCESS" ]] || fail "expected SUCCESS result"
  [[ "${AUTHORITY_LABEL_PRESENT}" == "false" ]] || fail "expected label cleared"
  pass "delete success with absent postcondition"
else
  fail "expected invalidation success"
fi

echo "==> 2. DELETE nonzero -> fail closed"
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

echo "==> 3. DELETE success but label still present -> postcondition fail"
HARNESS_GH_MODE=delete_success_label_still_present
AUTHORITY_LABEL_PRESENT=true
if invalidate_authority_label; then
  fail "expected postcondition failure"
else
  [[ "${LABEL_INVALIDATION_API_RESULT}" == "POSTCONDITION_FAIL" ]] || fail "expected POSTCONDITION_FAIL"
  pass "postcondition failure detected"
fi

echo "==> 4. diagnostic capture does not print token"
TOKEN_SAMPLE='ghs_supersecret_token_value Authorization: Bearer ghs_leaked'
SANITIZED="$(sanitize_api_diagnostic "${TOKEN_SAMPLE}")"
[[ "${SANITIZED}" != *"ghs_supersecret"* ]] || fail "token leaked in diagnostic"
[[ "${SANITIZED}" == *"[REDACTED"* ]] || fail "expected redaction marker"
pass "diagnostic sanitization"

echo "==> 5. synchronize stale approval cannot PASS (workflow contract grep)"
WORKFLOW="${REPO_ROOT}/.github/workflows/i18n-authority-protection.yml"
grep -q 'AUTHORITY_REAPPROVAL_REQUIRED_AFTER_HEAD_CHANGE' "${WORKFLOW}" || fail "missing synchronize fail reason"
grep -q 'invalidate_authority_label' "${WORKFLOW}" || fail "missing invalidation hook"
pass "synchronize stale approval remains fail-closed"

echo "==> 6. untrusted approval invalidation path remains fail-closed"
grep -q 'UNTRUSTED_AUTHORITY_APPROVAL_ACTOR' "${WORKFLOW}" || fail "missing untrusted actor reason"
pass "untrusted approval path preserved"

echo "==> 7. exact trusted labeled event remains approval path"
grep -q 'GOVERNANCE_AUTHORITY_APPROVED' "${WORKFLOW}" || fail "missing approved reason"
grep -q 'EVENT_ACTION.*labeled' "${WORKFLOW}" || fail "missing labeled gate"
pass "trusted labeled approval path preserved"

echo "==> 8. no PR-head executable code introduced"
if grep -q 'github.event.pull_request.head.sha' "${WORKFLOW}" && grep -q 'actions/checkout' "${WORKFLOW}"; then
  if grep -q 'ref:.*github.event.pull_request.head' "${WORKFLOW}"; then
    fail "PR-head checkout detected"
  fi
fi
pass "no PR-head checkout"

echo "==> 9. workflow remains pull_request_target from trusted base"
grep -q 'pull_request_target:' "${WORKFLOW}" || fail "missing pull_request_target"
pass "pull_request_target preserved"

echo "==> 10. authority namespace unchanged"
grep -q '.github/workflows/\*' "${WORKFLOW}" || fail "workflow authority namespace missing"
pass "authority namespace unchanged"

echo "Harness complete: ${PASS_COUNT} assertions passed, ${FAIL_COUNT} failures"
