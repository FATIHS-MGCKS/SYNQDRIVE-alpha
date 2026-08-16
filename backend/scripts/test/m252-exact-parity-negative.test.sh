#!/usr/bin/env bash
# Negative fail-closed tests for M252 exact parity verification.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${LEGAL_MIGRATION_PG_HOST:-127.0.0.1}"
PG_PORT="${LEGAL_MIGRATION_PG_PORT:-5432}"
PG_USER="${LEGAL_MIGRATION_PG_USER:-synqdrive}"
PG_PASSWORD="${LEGAL_MIGRATION_PG_PASSWORD:-synqdrive}"
PG_ADMIN_DB="${LEGAL_MIGRATION_PG_ADMIN_DB:-postgres}"
TEST_DB="synqdrive_m252_parity_negative"

export PGPASSWORD="$PG_PASSWORD"
export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1

psql_admin() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_ADMIN_DB" -v ON_ERROR_STOP=1 "$@"
}

recreate_db() {
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql_admin -c "DROP DATABASE IF EXISTS \"${TEST_DB}\";"
  psql_admin -c "CREATE DATABASE \"${TEST_DB}\";"
}

apply_base() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS "organizations" ("id" TEXT NOT NULL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS "organization_memberships" ("id" TEXT NOT NULL PRIMARY KEY);
SQL
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public" \
    npx ts-node scripts/apply-m252-ephemeral-recovery.ts
}

run_verify_expect_fail() {
  local label="$1"
  set +e
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public" \
    npx ts-node scripts/verify-m252-exact-parity.ts >/dev/null 2>&1
  local code=$?
  set -e
  if [[ "$code" -eq 0 ]]; then
    echo "Expected verify failure for ${label}, but it passed" >&2
    exit 1
  fi
  echo "OK negative: ${label}"
}

recreate_db
apply_base

DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public" \
  npx ts-node scripts/verify-m252-exact-parity.ts >/dev/null
echo "OK positive baseline parity"

cases=(
  "wrong column|ALTER TABLE organization_role_assignment_drift_reconciliation_applications ADD COLUMN wrong_col TEXT"
  "wrong PK|ALTER TABLE organization_role_assignment_drift_reconciliation_applications DROP CONSTRAINT org_role_asgn_drift_recon_apps_pkey; ALTER TABLE organization_role_assignment_drift_reconciliation_applications ADD CONSTRAINT org_role_asgn_drift_recon_apps_pkey PRIMARY KEY (idempotency_key)"
  "wrong unique|DROP INDEX org_role_asgn_drift_recon_apps_idem_key; CREATE UNIQUE INDEX org_role_asgn_drift_recon_apps_idem_key ON organization_role_assignment_drift_reconciliation_applications (organization_id)"
  "wrong composite|DROP INDEX org_role_asgn_drift_recon_apps_org_mbr_created_idx; CREATE INDEX org_role_asgn_drift_recon_apps_org_mbr_created_idx ON organization_role_assignment_drift_reconciliation_applications (organization_id)"
  "wrong FK target|ALTER TABLE organization_role_assignment_drift_reconciliation_applications DROP CONSTRAINT org_role_asgn_drift_recon_apps_org_id_fkey; ALTER TABLE organization_role_assignment_drift_reconciliation_applications ADD CONSTRAINT org_role_asgn_drift_recon_apps_org_id_fkey FOREIGN KEY (organization_id) REFERENCES organization_memberships (id) ON DELETE CASCADE ON UPDATE CASCADE"
  "wrong FK action|ALTER TABLE organization_role_assignment_drift_reconciliation_applications DROP CONSTRAINT org_role_asgn_drift_recon_apps_mbr_id_fkey; ALTER TABLE organization_role_assignment_drift_reconciliation_applications ADD CONSTRAINT org_role_asgn_drift_recon_apps_mbr_id_fkey FOREIGN KEY (membership_id) REFERENCES organization_memberships (id) ON DELETE RESTRICT ON UPDATE CASCADE"
  "unexpected object|CREATE INDEX m252_unexpected_extra_idx ON organization_role_assignment_drift_reconciliation_applications (operator)"
)

for entry in "${cases[@]}"; do
  label="${entry%%|*}"
  sql="${entry#*|}"
  recreate_db
  apply_base
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -c "$sql"
  run_verify_expect_fail "$label"
done

echo "M252 exact parity negative tests passed (${#cases[@]} cases)"
