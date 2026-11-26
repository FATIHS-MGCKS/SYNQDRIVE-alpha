#!/usr/bin/env bash
# USR-P2 disposable PostgreSQL gate (GitHub Actions + guarded local execution).
set -euo pipefail
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[usr-p2-postgres-gate] %s\n' "$*"; }
fail() { printf '[usr-p2-postgres-gate] FAIL: %s\n' "$*" >&2; exit 1; }

if [[ "${DATABASE_URL:-}" == *"app.synqdrive"* || "${DATABASE_URL:-}" == *"production"* ]]; then
  fail 'production-like DATABASE_URL is not permitted'
fi

PG_HOST="${CI_PG_HOST:-127.0.0.1}"
PG_PORT="${CI_PG_PORT:-5432}"
PG_USER="${USR_P2_PG_USER:-synqdrive}"
PG_PASSWORD="${USR_P2_PG_PASSWORD:-synqdrive}"

if ! [[ "$PG_HOST" =~ ^(127\.0\.0\.1|localhost)$ ]]; then
  fail "PG host must be loopback (got ${PG_HOST})"
fi

if ! [[ "$PG_PORT" =~ ^[0-9]+$ ]] || (( PG_PORT < 1 || PG_PORT > 65535 )); then
  fail "invalid PG port"
fi

EPHEMERAL_DB="${USR_P2_PG_DB:-usr_p2_disposable_$(date +%s)_$$_$(openssl rand -hex 4 2>/dev/null || echo rnd)}"
if ! [[ "$EPHEMERAL_DB" =~ ^usr_p2_[a-z0-9_]+$ ]]; then
  fail 'database name must match ^usr_p2_[a-z0-9_]+$'
fi
CREATED_BY_GATE=0

export PGPASSWORD="$PG_PASSWORD"
export PGHOST="$PG_HOST"
export PGPORT="$PG_PORT"

psql_admin() {
  psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d postgres "$@"
}

cleanup() {
  if [[ "${CREATED_BY_GATE:-0}" == 1 && -n "${EPHEMERAL_DB:-}" ]]; then
    psql_admin -c "DROP DATABASE IF EXISTS \"${EPHEMERAL_DB}\";" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log "create disposable database ${EPHEMERAL_DB}"
if psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname='${EPHEMERAL_DB}'" | grep -q 1; then
  fail "refusing to reuse existing database ${EPHEMERAL_DB}"
fi
psql_admin -c "CREATE DATABASE \"${EPHEMERAL_DB}\";" >/dev/null
CREATED_BY_GATE=1

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${EPHEMERAL_DB}?schema=public"

log 'migrate deploy (resilient)'
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

IAM_PARITY_SQL="${ROOT}/scripts/test/sql/ensure-ephemeral-iam-schema-parity.sql"
if [[ ! -f "${IAM_PARITY_SQL}" ]]; then
  fail "missing IAM parity SQL: ${IAM_PARITY_SQL}"
fi
log 'apply disposable IAM schema parity (TARGETED_SQL; not migration-derived)'
psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$EPHEMERAL_DB" < "${IAM_PARITY_SQL}" >/dev/null
echo "USR_P2_IAM_SCHEMA_PARITY=TARGETED_SQL"

log 'IAM schema preflight'
node scripts/test/usr-p2-iam-schema-preflight.mjs || fail 'IAM schema preflight failed'

export JWT_SECRET="${JWT_SECRET:-usr-p2-pg-test-secret}"

run_jest() {
  npx jest "$@" --runInBand --forceExit || fail "jest failed: $*"
}

run_jest_heavy() {
  node --max-old-space-size=8192 ./node_modules/jest/bin/jest.js "$@" --runInBand --forceExit \
    || fail "jest failed: $*"
}

log 'USR-P2A IAM schema smoke PostgreSQL'
export USR_P2A_IAM_SCHEMA_SMOKE_PG=1
run_jest usr-p2a-iam-schema-smoke.postgres.integration.spec.ts

log 'USR-P2 access revocation PostgreSQL'
export USR_P2_ACCESS_REVOCATION_PG=1
run_jest usr-p2-access-revocation.postgres.integration.spec.ts

log 'USR-P2 session concurrency PostgreSQL'
export USR_P2_SESSION_CONCURRENCY_PG=1
run_jest usr-p2-session-concurrency.postgres.integration.spec.ts

log 'USR-P2 security reset PostgreSQL'
export USR_P2_SECURITY_RESET_PG=1
run_jest usr-p2-security-reset.postgres.integration.spec.ts

log 'USR-P2 GATE-1 security mutation atomicity PostgreSQL'
export USR_P2_GATE1_PG=1
run_jest usr-p2-gate1-security-mutation.postgres.integration.spec.ts

log 'USR-P2B atomic security mutations PostgreSQL (sharded; avoids single-process heap OOM)'
export USR_P2B_ATOMIC_SECURITY_PG=1
P2B_SPEC=usr-p2b-atomic-security-mutations.postgres.integration.spec.ts
P2B_SHARDS=(
  'B01 AccountService'
  'B02 fresh login'
  'B03 distinct'
  'B04 same-operation'
  'B05 concurrent'
  'B06 transaction rollback'
  'B07 password reset'
  'B08 MFA reset'
  'B09 membership'
  'B10 password mutation'
  'B10 MFA reset'
  'B10 membership mutation'
  'ADMIN changePasswordAdmin'
  'multi-scope high-risk'
)
for shard in "${P2B_SHARDS[@]}"; do
  log "USR-P2B shard: ${shard}"
  run_jest_heavy "${P2B_SPEC}" -t "${shard}"
done

log 'USR-P2C deterministic race PostgreSQL'
export USR_P2C_DETERMINISTIC_RACE_PG=1
P2C_SPEC=usr-p2c-deterministic-race.postgres.integration.spec.ts
P2C_SHARDS=(
  'RACE01'
  'RACE02'
  'RACE03'
  'RACE04'
  'RACE05'
  'RACE07'
  'RACE08'
  'RACE11'
  'B05 concurrent first'
  'B10 password change waits'
  'CROSS_REPLICA'
)
for shard in "${P2C_SHARDS[@]}"; do
  log "USR-P2C shard: ${shard}"
  run_jest_heavy "${P2C_SPEC}" -t "${shard}"
done

log 'USR-P1A session audit PostgreSQL (full certification)'
export USR_P1A_SESSION_AUDIT_PG=1
run_jest usr-p1a-session-audit-certification.postgres.integration.spec.ts

log "PASS disposable database ${EPHEMERAL_DB}"
echo "USR_P2_PG_EXECUTED=1"