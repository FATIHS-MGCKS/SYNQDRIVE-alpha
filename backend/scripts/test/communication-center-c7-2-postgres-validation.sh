#!/usr/bin/env bash
# Communication Center C7.2 — disposable PostgreSQL validation
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${COMM_MIGRATION_PG_HOST:-127.0.0.1}"
PG_PORT="${COMM_MIGRATION_PG_PORT:-5432}"
PG_USER="${COMM_MIGRATION_PG_USER:-synqdrive}"
PG_PASSWORD="${COMM_MIGRATION_PG_PASSWORD:-synqdrive}"
PG_ADMIN_DB="${COMM_MIGRATION_PG_ADMIN_DB:-postgres}"

EMPTY_DB="${COMM_C72_EMPTY_DB:-synqdrive_c72_empty}"
UPGRADE_DB="${COMM_C72_UPGRADE_DB:-synqdrive_c72_upgrade}"
C72_MIGRATION="20260822120000_communication_center_c7_2_canonical_content"
C72_MIGRATION_DIR="prisma/migrations/${C72_MIGRATION}"

export PGPASSWORD="$PG_PASSWORD"

psql_admin() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_ADMIN_DB" -v ON_ERROR_STOP=1 "$@"
}

psql_db() {
  local db="$1"
  shift
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 "$@"
}

wait_for_postgres() {
  local attempts=30
  for ((i = 1; i <= attempts; i++)); do
    if psql_admin -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "PostgreSQL not reachable at ${PG_HOST}:${PG_PORT}" >&2
  return 1
}

recreate_db() {
  local db="$1"
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql_admin -c "DROP DATABASE IF EXISTS \"${db}\";"
  psql_admin -c "CREATE DATABASE \"${db}\";"
}

run_migrate_deploy() {
  local db="$1"
  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${db}?schema=public" \
    PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 \
    bash scripts/test/prisma-migrate-deploy-resilient.sh
}

assert_table_exists() {
  local db="$1"
  local table="$2"
  psql_db "$db" -tAc "SELECT to_regclass('public.${table}') IS NOT NULL;" | grep -qx 't'
}

assert_index_exists() {
  local db="$1"
  local index="$2"
  psql_db "$db" -tAc "SELECT 1 FROM pg_indexes WHERE indexname = '${index}';" | grep -qx '1'
}

test_empty_database() {
  echo "==> C7.2 empty database migration"
  recreate_db "$EMPTY_DB"
  run_migrate_deploy "$EMPTY_DB"

  assert_table_exists "$EMPTY_DB" communication_message_contents \
    || { echo "Expected communication_message_contents table" >&2; exit 1; }

  assert_index_exists "$EMPTY_DB" communication_message_contents_communication_event_id_key \
    || { echo "Expected communication_event_id unique index" >&2; exit 1; }

  assert_index_exists "$EMPTY_DB" communication_message_contents_org_idempotency_key \
    || { echo "Expected org+idempotency_key unique index" >&2; exit 1; }

  for fk in \
    communication_message_contents_organization_id_fkey \
    communication_message_contents_conversation_id_fkey \
    communication_message_contents_communication_event_id_fkey; do
    psql_db "$EMPTY_DB" -tAc "SELECT 1 FROM pg_constraint WHERE conname = '${fk}';" | grep -qx '1' \
      || { echo "Expected FK ${fk}" >&2; exit 1; }
  done

  DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${EMPTY_DB}?schema=public" \
    npx prisma validate

  echo "C7.2 empty database migration OK"
}

test_pre_c72_upgrade() {
  echo "==> C7.2 pre-schema upgrade migration"
  recreate_db "$UPGRADE_DB"

  local stash_dir
  stash_dir="$(mktemp -d /tmp/c72-mig-stash.XXXXXX)"
  mv "$C72_MIGRATION_DIR" "$stash_dir/"

  run_migrate_deploy "$UPGRADE_DB"

  psql_db "$UPGRADE_DB" <<'SQL'
INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
VALUES ('org-pre-c72', 'Pre C72 Org', 'RENTAL', 'ACTIVE', NOW(), NOW());

INSERT INTO communication_conversations (
  id, organization_id, channel, native_conversation_id, status, last_activity_at, created_at, updated_at
) VALUES (
  'cc-pre-c72', 'org-pre-c72', 'WHATSAPP', 'wa-native-pre', 'AI_ACTIVE', NOW(), NOW(), NOW()
);

INSERT INTO communication_events (
  id, organization_id, conversation_id, channel, event_type, occurred_at, idempotency_key, created_at
) VALUES (
  'ev-pre-c72', 'org-pre-c72', 'cc-pre-c72', 'WHATSAPP', 'MESSAGE_RECEIVED', NOW(), 'pre-c72:key', NOW()
);
SQL

  mv "$stash_dir/$(basename "$C72_MIGRATION_DIR")" "$C72_MIGRATION_DIR"
  rmdir "$stash_dir"

  run_migrate_deploy "$UPGRADE_DB"

  psql_db "$UPGRADE_DB" -tAc "SELECT COUNT(*) FROM communication_conversations WHERE id = 'cc-pre-c72';" | grep -qx '1'
  psql_db "$UPGRADE_DB" -tAc "SELECT COUNT(*) FROM communication_events WHERE id = 'ev-pre-c72';" | grep -qx '1'
  psql_db "$UPGRADE_DB" -tAc "SELECT COUNT(*) FROM communication_message_contents;" | grep -qx '0'
  assert_table_exists "$UPGRADE_DB" communication_message_contents

  echo "C7.2 pre-schema upgrade migration OK"
}

main() {
  wait_for_postgres
  test_empty_database
  test_pre_c72_upgrade
}

main "$@"
