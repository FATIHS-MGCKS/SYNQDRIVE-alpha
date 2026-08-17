#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPARE_SCRIPT="$ROOT/scripts/audits/compare-dependency-audit-baseline.js"
PR_BASE_SHA="${PR_BASE_SHA:-${GITHUB_EVENT_PULL_REQUEST_BASE_SHA:-}}"
PR_HEAD_SHA="${PR_HEAD_SHA:-${GITHUB_SHA:-}}"

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

if [[ -n "$PR_BASE_SHA" ]]; then
  echo "SECURITY_GATE_MODE=BASELINE_REGRESSION_FAIL_CLOSED"
  echo "PR_BASE_SHA=${PR_BASE_SHA}"
  echo "PR_HEAD_SHA=${PR_HEAD_SHA:-$(git -C "$ROOT" rev-parse HEAD)}"

  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  if ! git -C "$ROOT" cat-file -e "${PR_BASE_SHA}^{commit}" 2>/dev/null; then
    echo "FAIL_CLOSED: PR base SHA not available locally: ${PR_BASE_SHA}" >&2
    exit 2
  fi

  git -C "$ROOT" archive "${PR_BASE_SHA}" backend frontend | tar -x -C "$TMP"

  echo "Installing immutable base dependency trees..."
  run_surface_npm_ci "$TMP/backend"
  run_surface_npm_ci "$TMP/frontend"

  echo "Installing PR HEAD dependency trees..."
  run_surface_npm_ci "$ROOT/backend"
  run_surface_npm_ci "$ROOT/frontend"

  run_surface_audit_json "$TMP/backend" "$TMP/base-backend-audit.json"
  run_surface_audit_json "$TMP/frontend" "$TMP/base-frontend-audit.json"
  run_surface_audit_json "$ROOT/backend" "$TMP/pr-backend-audit.json"
  run_surface_audit_json "$ROOT/frontend" "$TMP/pr-frontend-audit.json"

  run_surface_audit_human "PR HEAD backend" "$ROOT/backend"
  run_surface_audit_human "PR HEAD frontend" "$ROOT/frontend"

  node "$COMPARE_SCRIPT" \
    --base-backend "$TMP/base-backend-audit.json" \
    --base-frontend "$TMP/base-frontend-audit.json" \
    --pr-backend "$TMP/pr-backend-audit.json" \
    --pr-frontend "$TMP/pr-frontend-audit.json" \
    --report "$TMP/baseline-regression-report.json"

  echo "Dependency baseline regression gate passed."
  exit 0
fi

echo "SECURITY_GATE_MODE=ABSOLUTE_HIGH_FAIL (no PR base SHA provided)"
echo "Running dependency audit (backend)..."
(
  cd "$ROOT/backend"
  npm audit --audit-level=high
)

echo "Running dependency audit (frontend)..."
(
  cd "$ROOT/frontend"
  npm audit --audit-level=high
)

echo "Dependency audit completed."
