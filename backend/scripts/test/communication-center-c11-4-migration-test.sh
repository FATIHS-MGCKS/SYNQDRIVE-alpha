#!/usr/bin/env bash
# Communication Center C11.4 — migration + legacy payload_hash compatibility.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_HOST="${COMM_MIGRATION_PG_HOST:-127.0.0.1}"
PG_PORT="${COMM_MIGRATION_PG_PORT:-5432}"
PG_USER="${COMM_MIGRATION_PG_USER:-synqdrive}"
PG_PASSWORD="${COMM_MIGRATION_PG_PASSWORD:-synqdrive}"
PG_ADMIN_DB="${COMM_MIGRATION_PG_ADMIN_DB:-postgres}"
TEST_DB="${COMM_MIGRATION_TEST_DB:-synqdrive_comm_c11_4_mig}"

export PGPASSWORD="$PG_PASSWORD"

psql_admin() {
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_ADMIN_DB" -v ON_ERROR_STOP=1 "$@"
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

main() {
  echo "==> Communication C11.4 migration test: full deploy + legacy null payload_hash rows"
  recreate_db "$TEST_DB"
  run_migrate_deploy "$TEST_DB"

  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
VALUES ('org-c114', 'C11.4 Legacy Org', 'RENTAL', 'ACTIVE', NOW(), NOW());

INSERT INTO whatsapp_conversations (
  id, organization_id, contact_phone, contact_phone_normalized, status, created_at, updated_at
) VALUES (
  'wa-c114', 'org-c114', '+491701111111', '491701111111', 'OPEN', NOW(), NOW()
);

INSERT INTO communication_conversations (
  id, organization_id, channel, native_conversation_id, status, last_activity_at, created_at, updated_at
) VALUES (
  'cc-c114', 'org-c114', 'WHATSAPP', 'wa-c114', 'HUMAN_ACTIVE', NOW(), NOW(), NOW()
);

INSERT INTO users (id, email, status, created_at, updated_at)
VALUES ('user-c114', 'legacy-c114@example.com', 'ACTIVE', NOW(), NOW());

-- Legacy C11.2 rows: payload_hash intentionally NULL (no SQL json_build_object backfill).
INSERT INTO communication_reply_commands (
  id, organization_id, conversation_id, client_idempotency_key, text, channel, send_state, actor_user_id, created_at, updated_at
) VALUES
  ('cmd-accepted', 'org-c114', 'cc-c114', 'legacy-accepted', 'Hello', 'WHATSAPP', 'ACCEPTED', 'user-c114', NOW(), NOW()),
  ('cmd-failed', 'org-c114', 'cc-c114', 'legacy-failed', 'Hello', 'WHATSAPP', 'FAILED', 'user-c114', NOW(), NOW()),
  ('cmd-pending', 'org-c114', 'cc-c114', 'legacy-pending', 'Hello', 'WHATSAPP', 'PENDING', 'user-c114', NOW(), NOW());

SELECT payload_hash IS NULL AS legacy_hash_null
FROM communication_reply_commands
WHERE id IN ('cmd-accepted', 'cmd-failed', 'cmd-pending');
SQL

  local null_count
  null_count="$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$TEST_DB" -tAc \
    "SELECT COUNT(*) FROM communication_reply_commands WHERE id LIKE 'cmd-%' AND payload_hash IS NULL;")"
  if [[ "$null_count" != "3" ]]; then
    echo "Expected 3 legacy rows with NULL payload_hash, got ${null_count}" >&2
    exit 1
  fi

  echo "Communication C11.4 migration validation OK (legacy payload_hash remains NULL)"
}

main "$@"
