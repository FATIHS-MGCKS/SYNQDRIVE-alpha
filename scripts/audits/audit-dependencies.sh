#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPARE_SCRIPT="$ROOT/scripts/audits/compare-dependency-audit-baseline.js"

is_zero_or_empty_sha() {
  local sha="${1:-}"
  [[ -z "$sha" ]] && return 0
  [[ "$sha" =~ ^0+$ ]] && return 0
  return 1
}

is_valid_commit_sha() {
  local sha="$1"
  git -C "$ROOT" cat-file -e "${sha}^{commit}" 2>/dev/null
}

resolve_audit_baseline_sha() {
  local event_name="${GITHUB_EVENT_NAME:-}"
  local pr_base="${PR_BASE_SHA:-${GITHUB_EVENT_PULL_REQUEST_BASE_SHA:-}}"
  local push_before="${PUSH_BEFORE_SHA:-${GITHUB_EVENT_BEFORE:-}}"

  if [[ "$event_name" == "pull_request" ]]; then
    if is_zero_or_empty_sha "$pr_base"; then
      echo "FAIL_CLOSED: pull_request event missing valid PR base SHA" >&2
      return 2
    fi
    if ! is_valid_commit_sha "$pr_base"; then
      echo "FAIL_CLOSED: pull_request PR base SHA not available locally: ${pr_base}" >&2
      return 2
    fi
    printf '%s\n' "$pr_base"
    return 0
  fi

  if [[ "$event_name" == "push" ]]; then
    if is_zero_or_empty_sha "$push_before"; then
      echo "FAIL_CLOSED: push event missing valid github.event.before baseline SHA" >&2
      return 2
    fi
    if ! is_valid_commit_sha "$push_before"; then
      echo "FAIL_CLOSED: push before SHA not available locally: ${push_before}" >&2
      return 2
    fi
    printf '%s\n' "$push_before"
    return 0
  fi

  # Backward-compatible direct env override (local/CI harness) when event name is unset.
  if ! is_zero_or_empty_sha "$pr_base" && is_valid_commit_sha "$pr_base"; then
    printf '%s\n' "$pr_base"
    return 0
  fi

  echo "FAIL_CLOSED: unsupported or incomplete audit baseline context (event=${event_name:-unknown})" >&2
  return 2
}

run_surface_audit_json() {
  local dir="$1"
  local out="$2"
  (
    cd "$dir"
    npm audit --json >"$out" 2>/dev/null || true
  )
  if [[ ! -s "$out" ]]; then
    echo "FAIL_CLOSED: empty audit JSON for ${dir}" >&2
    exit 2
  fi
}

run_surface_audit_human() {
  local label="$1"
  local dir="$2"
  echo "=== ${label} dependency audit (full findings) ==="
  (
    cd "$dir"
    npm audit || true
  )
}

run_surface_npm_ci() {
  local dir="$1"
  (
    cd "$dir"
    npm ci
  )
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  PR_HEAD_SHA="${PR_HEAD_SHA:-${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD)}}"

  AUDIT_BASE_SHA="$(resolve_audit_baseline_sha)" || exit $?

  if is_zero_or_empty_sha "$PR_HEAD_SHA"; then
    echo "FAIL_CLOSED: audit head SHA missing" >&2
    exit 2
  fi

  if ! is_valid_commit_sha "$PR_HEAD_SHA"; then
    echo "FAIL_CLOSED: audit head SHA not available locally: ${PR_HEAD_SHA}" >&2
    exit 2
  fi

  echo "SECURITY_GATE_MODE=BASELINE_REGRESSION_FAIL_CLOSED"
  echo "AUDIT_BASE_SHA=${AUDIT_BASE_SHA}"
  echo "AUDIT_HEAD_SHA=${PR_HEAD_SHA}"
  echo "GITHUB_EVENT_NAME=${GITHUB_EVENT_NAME:-unset}"

  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  git -C "$ROOT" archive "${AUDIT_BASE_SHA}" backend frontend | tar -x -C "$TMP"

  echo "Installing immutable baseline dependency trees..."
  run_surface_npm_ci "$TMP/backend"
  run_surface_npm_ci "$TMP/frontend"

  echo "Installing HEAD dependency trees..."
  run_surface_npm_ci "$ROOT/backend"
  run_surface_npm_ci "$ROOT/frontend"

  run_surface_audit_json "$TMP/backend" "$TMP/base-backend-audit.json"
  run_surface_audit_json "$TMP/frontend" "$TMP/base-frontend-audit.json"
  run_surface_audit_json "$ROOT/backend" "$TMP/head-backend-audit.json"
  run_surface_audit_json "$ROOT/frontend" "$TMP/head-frontend-audit.json"

  run_surface_audit_human "HEAD backend" "$ROOT/backend"
  run_surface_audit_human "HEAD frontend" "$ROOT/frontend"

  node "$COMPARE_SCRIPT" \
    --base-backend "$TMP/base-backend-audit.json" \
    --base-frontend "$TMP/base-frontend-audit.json" \
    --pr-backend "$TMP/head-backend-audit.json" \
    --pr-frontend "$TMP/head-frontend-audit.json" \
    --report "$TMP/baseline-regression-report.json"

  echo "Dependency baseline regression gate passed."
fi
