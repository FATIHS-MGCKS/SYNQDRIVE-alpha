#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUDIT_SCRIPT="$ROOT/scripts/audits/audit-dependencies.sh"

run_resolution() {
  local expect_exit="$1"
  local expect_substr="${2:-}"
  shift 2
  set +e
  local out
  out="$(
    env "$@" bash -c '
      source "$1"
      resolve_audit_baseline_sha
    ' _ "$AUDIT_SCRIPT" 2>&1
  )"
  local code=$?
  set -e
  if [[ "$code" -ne "$expect_exit" ]]; then
    echo "FAIL expected exit ${expect_exit}, got ${code}: $out"
    exit 1
  fi
  if [[ -n "$expect_substr" && "$out" != *"$expect_substr"* ]]; then
    echo "FAIL expected output to contain '${expect_substr}': $out"
    exit 1
  fi
  echo "PASS exit=${expect_exit} env=$*"
}

# pull_request with valid base
run_resolution 0 "bd732a8" \
  GITHUB_EVENT_NAME=pull_request \
  PR_BASE_SHA=bd732a8f7a6467565a8668ea136e81b79a04666a

# push with valid before SHA (E8 main push baseline)
run_resolution 0 "bd732a8" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA=bd732a8f7a6467565a8668ea136e81b79a04666a

# push with zero sentinel before SHA => fail closed
run_resolution 2 "FAIL_CLOSED" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA=0000000000000000000000000000000000000000

# push with empty before => fail closed
run_resolution 2 "FAIL_CLOSED" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA=

# pull_request with empty base => fail closed
run_resolution 2 "FAIL_CLOSED" \
  GITHUB_EVENT_NAME=pull_request \
  PR_BASE_SHA=

# malformed baseline => fail closed
run_resolution 2 "FAIL_CLOSED" \
  GITHUB_EVENT_NAME=push \
  PUSH_BEFORE_SHA=not-a-valid-sha

# unsupported event with no override => fail closed
run_resolution 2 "FAIL_CLOSED" \
  GITHUB_EVENT_NAME=workflow_dispatch

# legacy direct PR_BASE_SHA override when event unset (local harness)
run_resolution 0 "bd732a8" \
  PR_BASE_SHA=bd732a8f7a6467565a8668ea136e81b79a04666a

echo "BASELINE_RESOLUTION_TESTS=7"
echo "INVALID_BASELINE_ACCEPTED=0"
