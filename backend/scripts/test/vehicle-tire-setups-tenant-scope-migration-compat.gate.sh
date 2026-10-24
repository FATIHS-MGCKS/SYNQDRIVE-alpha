#!/usr/bin/env bash
# Tire P2: 20261024194500_vehicle_tire_setups_tenant_scope_columns — fresh + production-drift replay.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${CI_PG_HOST:-127.0.0.1}"
PG_PORT="${CI_PG_PORT:-5432}"
PG_USER="${CI_PG_USER:-synqdrive}"
PG_PASSWORD="${CI_PG_PASSWORD:-synqdrive}"
MIGRATION_NAME='20261024194500_vehicle_tire_setups_tenant_scope_columns'

export PGPASSWORD="$PG_PASSWORD"

psql_db() {
  local db="$1"
  shift
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 "$@"
}

recreate_db() {
  local db="$1"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"${db}\";"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"${db}\";"
}

migrate_deploy() {
  local db="$1"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${db}?schema=public" \
    PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
    bash scripts/test/prisma-migrate-deploy-resilient.sh
}

assert_tenant_scope_objects() {
  local db="$1"
  psql_db "$db" -At -c "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vehicle_tire_setups'
        AND column_name = 'organization_id' AND data_type = 'text' AND is_nullable = 'YES'
    );
  " | grep -q '^t$'

  psql_db "$db" -At -c "
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relname = 'vehicle_tire_setups'
        AND a.attname = 'is_staggered' AND NOT a.attisdropped
        AND a.attnotnull AND btrim(pg_get_expr(ad.adbin, ad.adrelid)) = 'false'
    );
  " | grep -q '^t$'

  psql_db "$db" -At -c "
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'vehicle_tire_setups'
        AND indexname = 'vehicle_tire_setups_organization_id_vehicle_id_idx'
    );
  " | grep -q '^t$'

  psql_db "$db" -At -c "
    SELECT finished_at IS NOT NULL FROM _prisma_migrations
    WHERE migration_name = '${MIGRATION_NAME}';
  " | grep -q '^t$'
}

echo "==> vehicle_tire_setups tenant-scope migration: fresh database"
FRESH_DB="vts_tenant_scope_fresh_${RANDOM}"
recreate_db "$FRESH_DB"
migrate_deploy "$FRESH_DB"
assert_tenant_scope_objects "$FRESH_DB"

echo "==> vehicle_tire_setups tenant-scope migration: production drift (objects without migration row)"
DRIFT_DB="vts_tenant_scope_drift_${RANDOM}"
recreate_db "$DRIFT_DB"
migrate_deploy "$DRIFT_DB"

# Snapshot org_id values before replay (should be unchanged — table may be empty on fresh migrate).
ORG_SNAPSHOT="$(psql_db "$DRIFT_DB" -At -c "SELECT coalesce(string_agg(organization_id::text, ',' ORDER BY id), '') FROM vehicle_tire_setups;")"
STAGGER_SNAPSHOT="$(psql_db "$DRIFT_DB" -At -c "SELECT coalesce(string_agg(is_staggered::text, ',' ORDER BY id), '') FROM vehicle_tire_setups;")"

psql_db "$DRIFT_DB" -c "DELETE FROM _prisma_migrations WHERE migration_name = '${MIGRATION_NAME}';"
migrate_deploy "$DRIFT_DB"
assert_tenant_scope_objects "$DRIFT_DB"

ORG_AFTER="$(psql_db "$DRIFT_DB" -At -c "SELECT coalesce(string_agg(organization_id::text, ',' ORDER BY id), '') FROM vehicle_tire_setups;")"
STAGGER_AFTER="$(psql_db "$DRIFT_DB" -At -c "SELECT coalesce(string_agg(is_staggered::text, ',' ORDER BY id), '') FROM vehicle_tire_setups;")"
if [[ "$ORG_SNAPSHOT" != "$ORG_AFTER" || "$STAGGER_SNAPSHOT" != "$STAGGER_AFTER" ]]; then
  echo "tenant-scope migration replay mutated organization_id or is_staggered values" >&2
  exit 1
fi

echo "==> vehicle_tire_setups tenant-scope migration compat gate PASS"
