#!/usr/bin/env bash
# P2.5 APDS-9.0 — read-only cohort binding preflight (no Production mutation).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${WORKER_APD_SHADOW_COHORT_JSON:-}" ]]; then
  echo "FAIL: WORKER_APD_SHADOW_COHORT_JSON is required" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "FAIL: DATABASE_URL is required (read-only SELECT)" >&2
  exit 1
fi

echo "[p25-apd-shadow-cohort-preflight] READ_ONLY=1" >&2
npx ts-node -r tsconfig-paths/register \
  scripts/ops/p25-apd-shadow-cohort-production-preflight.ts
