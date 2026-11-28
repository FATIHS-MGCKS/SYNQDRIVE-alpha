#!/usr/bin/env bash
# USR-P3A.3 disposable PostgreSQL acceptance gate (local / trusted CI runner — NOT wired in default USR-P2 gate).
set -euo pipefail
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[usr-p3a3-postgres-gate] %s\n' "$*"; }
fail() { printf '[usr-p3a3-postgres-gate] FAIL: %s\n' "$*" >&2; exit 1; }

if [[ "${DATABASE_URL:-}" == *"app.synqdrive"* || "${DATABASE_URL:-}" == *"production"* ]]; then
  fail 'production-like DATABASE_URL is not permitted'
fi

PG_HOST="${CI_PG_HOST:-127.0.0.1}"
PG_PORT="${CI_PG_PORT:-5432}"
PG_USER="${USR_P3A3_PG_USER:-${USR_P2_PG_USER:-synqdrive}}"
PG_PASSWORD="${USR_P3A3_PG_PASSWORD:-${USR_P2_PG_PASSWORD:-synqdrive}}"

if ! [[ "$PG_HOST" =~ ^(127\.0\.0\.1|localhost)$ ]]; then
  fail "PG host must be loopback (got ${PG_HOST})"
fi

EPHEMERAL_DB="${USR_P3A3_PG_DB:-usr_p2_p3a3_$(date +%s)_$$_$(openssl rand -hex 4 2>/dev/null || echo rnd)}"
if ! [[ "$EPHEMERAL_DB" =~ ^usr_p2_[a-z0-9_]+$ ]]; then
  fail 'database name must match ^usr_p2_[a-z0-9_]+$ (USR-P2 preflight compatible)'
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
psql_admin -c "CREATE DATABASE \"${EPHEMERAL_DB}\";" >/dev/null
CREATED_BY_GATE=1

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${EPHEMERAL_DB}?schema=public"

log 'migrate deploy (resilient)'
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

IAM_PARITY_SQL="${ROOT}/scripts/test/sql/ensure-ephemeral-iam-schema-parity.sql"
if [[ -f "${IAM_PARITY_SQL}" ]]; then
  log 'apply disposable IAM schema parity'
  psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$EPHEMERAL_DB" < "${IAM_PARITY_SQL}" >/dev/null
fi

log 'IAM schema preflight (when script present)'
if [[ -f "${ROOT}/scripts/test/usr-p2-iam-schema-preflight.mjs" ]]; then
  node scripts/test/usr-p2-iam-schema-preflight.mjs || fail 'IAM schema preflight failed'
fi

run_jest() {
  npx jest "$@" --runInBand --forceExit || fail "jest failed: $*"
}

log 'USR-P3A.1 master identity PostgreSQL (full disposable suite)'
export USR_P3A1_MASTER_IDENTITY_PG=1
run_jest usr-p3a1-master-identity.postgres.integration.spec.ts

log 'USR-P3A.3 master identity security PostgreSQL'
export USR_P3A3_MASTER_IDENTITY_PG=1
run_jest usr-p3a3-master-identity-security.postgres.integration.spec.ts

log 'USR-P3A.3A transaction + invitation PostgreSQL'
run_jest usr-p3a3-transaction-invitation.postgres.integration.spec.ts

log 'USR-P3A.3A actual first-login (public HTTP, PostgreSQL)'
export USR_P3A3_FIRST_LOGIN_HTTP_PG=1
export USR_P3A3_FIRST_LOGIN_SECURITY_EDGE_PG=1
run_jest usr-p3a3-first-login-http.postgres.integration.spec.ts
run_jest usr-p3a3-first-login-security-edge.postgres.integration.spec.ts

log 'USR-P3A.3A credential authority + FLE (PostgreSQL)'
export USR_P3A3_CREDENTIAL_AUTHORITY_PG=1
run_jest usr-p3a3-credential-authority.postgres.integration.spec.ts

log 'USR-P3A.3 identity HTTP authorization (PostgreSQL)'
export USR_P3A3_IDENTITY_HTTP_PG=1
run_jest usr-p3a3-identity-http-security.postgres.integration.spec.ts

log 'USR-P3A policy unit (fingerprint / replay binding)'
npx jest master-global-identity-operation.policy.spec.ts --runInBand --forceExit

log 'IAM invite acceptance security regression'
npx jest iam-invite-acceptance.security.spec.ts --runInBand --forceExit

log "PASS disposable database ${EPHEMERAL_DB}"
echo "USR_P3A3_PG_EXECUTED=1"
echo "USR_P3A3_PG_DB=${EPHEMERAL_DB}"
echo "USR_P3A3_PG_HOST=${PG_HOST}"