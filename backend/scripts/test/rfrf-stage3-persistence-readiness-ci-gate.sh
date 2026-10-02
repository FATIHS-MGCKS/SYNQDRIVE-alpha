#!/usr/bin/env bash
# RFRF F10.5.0.1 — Stage-3 persistence readiness (isolated PG + Redis only).
set -euo pipefail

BACKEND_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${BACKEND_ROOT}/.." && pwd)"

export RFRF_CI_POSTGRES_SUPERUSER_URL="${RFRF_CI_POSTGRES_SUPERUSER_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"

echo "==> RFRF F3→F2 handoff PostgreSQL gate"
bash "${SCRIPT_DIR}/rfrf-f3-f2-handoff-postgres-gate.sh"
echo "RFRF_F3_F2_HANDOFF_REAL_PG=PASS"

echo "==> RFRF F4-PR2 runtime PostgreSQL gate (includes F3 handoff + candidate integration)"
bash "${SCRIPT_DIR}/rfrf-f4-pr2-runtime-postgres-gate.sh"
echo "RFRF_F4_PR2_RUNTIME_REAL_PG=PASS"
echo "RAW_REFUEL_CANDIDATE_REAL_PG=PASS"

echo "==> RFRF F9 multi-replica PostgreSQL + Redis gate"
bash "${SCRIPT_DIR}/rfrf-f9-multi-replica-integration-gate.sh"
echo "RFRF_F9_MULTI_REPLICA_REAL_PG_REDIS=PASS"

echo "RFRF_STAGE3_PERSISTENCE_READINESS_CI_GATE=PASS"
