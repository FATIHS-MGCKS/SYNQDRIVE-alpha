#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

backend_exit=0
frontend_exit=0

echo "Running dependency audit (backend)..."
(
  cd "$ROOT/backend"
  npm audit --audit-level=high
)
backend_exit=$?

echo "Running dependency audit (frontend)..."
(
  cd "$ROOT/frontend"
  npm audit --audit-level=high
)
frontend_exit=$?

echo "Backend audit exit code: ${backend_exit}"
echo "Frontend audit exit code: ${frontend_exit}"

if [[ "${backend_exit}" -ne 0 || "${frontend_exit}" -ne 0 ]]; then
  echo "Dependency audit failed (high/critical findings present)."
  exit 1
fi

echo "Dependency audit completed."
