#!/usr/bin/env bash
# RFRF F10.6.0 — Stage-4 convergence readiness (isolated PG + Redis; non-vacuous authority matrix).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"

export RFRF_CI_POSTGRES_SUPERUSER_URL="${RFRF_CI_POSTGRES_SUPERUSER_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

echo "==> RFRF F5-PR1 authoritative convergence gate"
bash "${SCRIPT_DIR}/rfrf-f5-pr1-authoritative-convergence-gate.sh"
echo "STAGE4_CONVERGENCE_REAL_PG=PASS"

echo "==> RFRF F5-PR2 promotion boundary (P20 convergence ON / promotion OFF)"
cd "${BACKEND_ROOT}"
npm test -- --runInBand --forceExit \
  --testPathPattern=raw-fuel-refuel-fallback-f5-pr2-promotion.postgres.integration.spec.ts \
  --testNamePattern='P20 — convergence ON but promotion execution OFF => zero VEE'

echo "==> RFRF F9 multi-replica convergence safety (independent replica + prior gates)"
bash "${SCRIPT_DIR}/rfrf-f9-multi-replica-integration-gate.sh"
echo "STAGE4_MULTI_REPLICA_CONVERGENCE_SAFETY=PASS"

echo "==> RFRF F10.6.8-B candidate recovery PostgreSQL matrix"
bash "${SCRIPT_DIR}/rfrf-f10-6-8-b-candidate-recovery-gate.sh"
echo "STAGE4_F10_6_8_B_RECOVERY_PG_MATRIX=PASS"

echo "==> RFRF F10.6.8-C recovery-owned promotion PostgreSQL gate"
bash "${SCRIPT_DIR}/rfrf-f10-6-8-c-recovery-promotion-gate.sh"
echo "STAGE4_F10_6_8_C_RECOVERY_PROMOTION_PG=PASS"

echo "RFRF_STAGE4_CONVERGENCE_READINESS_CI_GATE=PASS"
