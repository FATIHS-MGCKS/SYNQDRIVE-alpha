#!/usr/bin/env bash
# Communication Center C1 — PostgreSQL migration validation (empty database).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${COMM_MIGRATION_PG_HOST:-127.0.0.1}"
PG_PORT="${COMM_MIGRATION_PG_PORT:-5432}"
PG_USER="${COMM_MIGRATION_PG_USER:-synqdrive}"
PG_PASSWORD="${COMM_MIGRATION_PG_PASSWORD:-synqdrive}"
PG_ADMIN_DB="${COMM_MIGRATION_PG_ADMIN_DB:-postgres}"

TEST_DB="${COMM_MIGRATION_TEST_DB:-synqdrive_comm_c1_mig}"

export PGPASSWORD="$PG_PASSWORD"

psql_admin() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_ADMIN_DB" -v ON_ERROR_STOP=1 "$@"
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
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" -tAc \
    "SELECT to_regclass('public.${table}') IS NOT NULL;" | grep -qx 't'
}

assert_constraint_exists() {
  local db="$1"
  local constraint="$2"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" -tAc \
    "SELECT 1 FROM pg_constraint WHERE conname = '${constraint}';" | grep -qx '1'
}

test_empty_database() {
  echo "==> Communication C1 migration test: empty database"
  recreate_db "$TEST_DB"
  run_migrate_deploy "$TEST_DB"

  local db_url="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${TEST_DB}?schema=public"

  for table in communication_conversations communication_events; do
    if ! assert_table_exists "$TEST_DB" "$table"; then
      echo "Expected table ${table} to exist" >&2
      exit 1
    fi
  done

  assert_constraint_exists "$TEST_DB" communication_conversations_unread_count_check \
    || { echo "Expected unread_count CHECK constraint" >&2; exit 1; }

  assert_constraint_exists "$TEST_DB" communication_conversations_assigned_user_id_fkey \
    || { echo "Expected assigned_user_id FK" >&2; exit 1; }

  # Native reference unique
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
VALUES ('org-c1', 'C1 Test Org', 'RENTAL', 'ACTIVE', NOW(), NOW());

INSERT INTO communication_conversations (
  id, organization_id, channel, native_conversation_id, status, last_activity_at, created_at, updated_at
) VALUES (
  'cc-native-1', 'org-c1', 'WHATSAPP', 'wa-native-1', 'AI_ACTIVE', NOW(), NOW(), NOW()
);

-- Duplicate native reference must fail
DO $$
BEGIN
  INSERT INTO communication_conversations (
    id, organization_id, channel, native_conversation_id, status, last_activity_at, created_at, updated_at
  ) VALUES (
    'cc-native-dup', 'org-c1', 'WHATSAPP', 'wa-native-1', 'AI_ACTIVE', NOW(), NOW(), NOW()
  );
  RAISE EXCEPTION 'expected duplicate native reference failure';
EXCEPTION WHEN unique_violation THEN
  NULL;
END $$;

-- Idempotency unique
INSERT INTO communication_events (
  id, organization_id, conversation_id, channel, event_type, occurred_at, idempotency_key, created_at
) VALUES (
  'ev-1', 'org-c1', 'cc-native-1', 'WHATSAPP', 'MESSAGE_SENT', NOW(), 'org-c1:wa:1', NOW()
);

DO $$
BEGIN
  INSERT INTO communication_events (
    id, organization_id, conversation_id, channel, event_type, occurred_at, idempotency_key, created_at
  ) VALUES (
    'ev-dup', 'org-c1', 'cc-native-1', 'WHATSAPP', 'MESSAGE_SENT', NOW(), 'org-c1:wa:1', NOW()
  );
  RAISE EXCEPTION 'expected duplicate idempotency key failure';
EXCEPTION WHEN unique_violation THEN
  NULL;
END $$;

-- Multiple NULL provider fields allowed (PostgreSQL semantics)
INSERT INTO communication_events (
  id, organization_id, conversation_id, channel, event_type, occurred_at, created_at
) VALUES (
  'ev-null-a', 'org-c1', 'cc-native-1', 'WHATSAPP', 'MESSAGE_RECEIVED', NOW(), NOW()
);
INSERT INTO communication_events (
  id, organization_id, conversation_id, channel, event_type, occurred_at, created_at
) VALUES (
  'ev-null-b', 'org-c1', 'cc-native-1', 'WHATSAPP', 'MESSAGE_RECEIVED', NOW() + interval '1 second', NOW()
);

-- unread_count CHECK
DO $$
BEGIN
  UPDATE communication_conversations SET unread_count = -1 WHERE id = 'cc-native-1';
  RAISE EXCEPTION 'expected unread_count CHECK failure';
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;
SQL

  DATABASE_URL="$db_url" npx prisma validate
  DATABASE_URL="$db_url" npx prisma generate

  echo "Communication C1 migration validation OK"
}

main() {
  wait_for_postgres
  test_empty_database
}

main "$@"
