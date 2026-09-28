#!/usr/bin/env bash
# EED hybrid absolute signal trust — localhost PostgreSQL promotion pipeline proofs (P1–P10).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export RAW_REFUEL_HYBRID_TRUST_INTEGRATION=1
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public}"

cd "${BACKEND_ROOT}"
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-hybrid-trust.postgres.integration.spec.ts

echo "RFRF_HYBRID_TRUST_POSTGRES_GATE=PASS"
