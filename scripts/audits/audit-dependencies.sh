#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Running dependency audit (backend)..."
cd "$ROOT/backend"
npm audit --audit-level=high

echo "Running dependency audit (frontend)..."
cd "$ROOT/frontend"
npm audit --audit-level=high

echo "Dependency audit completed."
