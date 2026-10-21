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
  --testPathPatterns=raw-fuel-refuel-fallback-f5-pr2-promotion.postgres.integration.spec.ts \
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

echo "==> RFRF OQ-015 stretched-end PostgreSQL convergence gate"
bash "${SCRIPT_DIR}/rfrf-oq015-stretched-end-postgres-gate.sh"
echo "STAGE4_OQ015_STRETCHED_END_POSTGRES=PASS"

echo "==> RFRF baseline recency promotion firewall PostgreSQL gate"
bash "${SCRIPT_DIR}/rfrf-baseline-recency-postgres-gate.sh"
echo "STAGE4_BASELINE_RECENCY_POSTGRES=PASS"

echo "==> RFRF READY evidence refresh PostgreSQL gate"
bash "${SCRIPT_DIR}/rfrf-ready-evidence-refresh-postgres-gate.sh"
echo "STAGE4_READY_EVIDENCE_REFRESH_POSTGRES=PASS"

echo "==> RFRF hybrid absolute signal trust PostgreSQL gate"
bash "${SCRIPT_DIR}/rfrf-hybrid-trust-postgres-gate.sh"
echo "STAGE4_HYBRID_TRUST_POSTGRES=PASS"

echo "==> RFRF hybrid trust scoped activation PostgreSQL gate"
bash "${SCRIPT_DIR}/rfrf-hybrid-trust-activation-postgres-gate.sh"
echo "STAGE4_HYBRID_TRUST_ACTIVATION_POSTGRES=PASS"

echo "RFRF_STAGE4_CONVERGENCE_READINESS_CI_GATE=PASS"
