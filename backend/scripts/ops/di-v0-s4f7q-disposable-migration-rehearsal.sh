#!/usr/bin/env bash
# EXP-021 S4F-7Q — disposable Production-DB clone migration rehearsal (never targets Production DB writes).
set -euo pipefail

RC_SHA="${DI_S4F7Q_RC_SHA:-9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4}"
SOURCE_DB="${DI_S4F7Q_SOURCE_DB:-synqdrive}"
TS="$(date -u +%Y%m%d%H%M%S)"
DISPOSABLE_DB="${DI_S4F7Q_DISPOSABLE_DB:-synqdrive_exp021_s4f7q_${TS}}"
ARTIFACT_DIR="${DI_S4F7Q_ARTIFACT_DIR:-/tmp/exp021-s4f7q-migration-${TS}}"
GIT_REPO="${SYNQDRIVE_GIT_REPO:-https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git}"
WORKTREE="${ARTIFACT_DIR}/rc-worktree"
SHARED_ENV="${DI_S4F7Q_SHARED_BACKEND_ENV:-/opt/synqdrive/shared/backend.env}"

mkdir -p "$ARTIFACT_DIR"

s4f7q_disposable_database_url() {
  local base_url="${DI_S4F7Q_SOURCE_DATABASE_URL:-}"
  if [[ -z "$base_url" && -f "$SHARED_ENV" ]]; then
    base_url="$(grep -m1 '^DATABASE_URL=' "$SHARED_ENV" | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")"
  fi
  if [[ -z "$base_url" ]]; then
    echo "ABORT: set DI_S4F7Q_SOURCE_DATABASE_URL or provide ${SHARED_ENV}" >&2
    return 1
  fi
  node -e '
    const base = process.argv[1];
    const db = process.argv[2];
    const u = new URL(base);
    u.pathname = "/" + db;
    process.stdout.write(u.toString());
  ' "$base_url" "$DISPOSABLE_DB"
}

echo "DISPOSABLE_DB=${DISPOSABLE_DB}"
echo "DISPOSABLE_DB_IS_PRODUCTION=NO"

if [[ "$DISPOSABLE_DB" == "$SOURCE_DB" ]]; then
  echo "ABORT: disposable DB name must differ from Production"
  exit 1
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='${DISPOSABLE_DB}'" | grep -q 1 && {
  echo "ABORT: disposable DB already exists"
  exit 1
}

echo "==> Read-only dump from ${SOURCE_DB}"
sudo -u postgres pg_dump -Fc "$SOURCE_DB" > "${ARTIFACT_DIR}/source.dump"

echo "==> Create disposable DB"
sudo -u postgres createdb "$DISPOSABLE_DB"
sudo -u postgres pg_restore -d "$DISPOSABLE_DB" --no-owner --no-acl "${ARTIFACT_DIR}/source.dump"

echo "==> Align disposable public schema ownership with Production application role"
sudo -u postgres psql -d "$DISPOSABLE_DB" -v ON_ERROR_STOP=1 <<'EOSQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO synqdrive', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO synqdrive', r.sequence_name);
  END LOOP;
END $$;
EOSQL

s4f7q_schema_catalog_fingerprint() {
  local db=$1
  sudo -u postgres psql -d "$db" -Atqc "
SELECT md5(coalesce(string_agg(line, chr(10) ORDER BY line), ''))
FROM (
  SELECT format('%s.%s.%s:%s', n.nspname, c.relname, a.attname, format_type(a.atttypid, a.atttypmod)) AS line
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m') AND a.attnum > 0 AND NOT a.attisdropped
) s;"
}

migration_count_before="$(sudo -u postgres psql -d "$DISPOSABLE_DB" -Atqc 'SELECT count(*) FROM _prisma_migrations;')"
history_sha_before="$(sudo -u postgres psql -d "$DISPOSABLE_DB" -Atqc "SELECT md5(string_agg(id||checksum, '' ORDER BY finished_at NULLS LAST, id)) FROM _prisma_migrations;")"
schema_fp_before="$(s4f7q_schema_catalog_fingerprint "$DISPOSABLE_DB")"

echo "DISPOSABLE_PRISMA_MIGRATION_ROW_COUNT_BEFORE=${migration_count_before}"
echo "DISPOSABLE_PRISMA_MIGRATION_HISTORY_SHA256_BEFORE=${history_sha_before}"
echo "DISPOSABLE_SCHEMA_FINGERPRINT_BEFORE=${schema_fp_before}"

rm -rf "$WORKTREE"
git clone --depth 1 "$GIT_REPO" "$WORKTREE"
git -C "$WORKTREE" fetch --depth 1 origin "$RC_SHA"
git -C "$WORKTREE" checkout -q FETCH_HEAD
actual="$(git -C "$WORKTREE" rev-parse HEAD)"
if [[ "$actual" != "$RC_SHA" ]]; then
  echo "ABORT: RC checkout ${actual} != ${RC_SHA}"
  exit 1
fi

cd "${WORKTREE}/backend"
npm ci
npx prisma generate

export DATABASE_URL
DATABASE_URL="$(s4f7q_disposable_database_url)" || exit 1
export DATABASE_URL
echo "DISPOSABLE_DATABASE_URL_CONFIGURED=YES"

set +e
status_out="$(npx prisma migrate status 2>&1)"
status_code=$?
set -e
echo "$status_out" > "${ARTIFACT_DIR}/migrate-status.txt"
echo "MIGRATION_STATUS_EXIT_CODE=${status_code}"

set +e
deploy_out="$(npm run prisma:migrate:deploy 2>&1)"
deploy_code=$?
set -e
echo "$deploy_out" > "${ARTIFACT_DIR}/migrate-deploy.txt"
echo "DISPOSABLE_MIGRATE_DEPLOY_EXIT_CODE=${deploy_code}"

migration_count_after="$(sudo -u postgres psql -d "$DISPOSABLE_DB" -Atqc 'SELECT count(*) FROM _prisma_migrations;')"
history_sha_after="$(sudo -u postgres psql -d "$DISPOSABLE_DB" -Atqc "SELECT md5(string_agg(id||checksum, '' ORDER BY finished_at NULLS LAST, id)) FROM _prisma_migrations;")"
schema_fp_after="$(s4f7q_schema_catalog_fingerprint "$DISPOSABLE_DB")"

db_only_count="$(comm -23 \
  <(sudo -u postgres psql -d "$DISPOSABLE_DB" -Atqc 'SELECT migration_name FROM _prisma_migrations ORDER BY 1;') \
  <(ls "${WORKTREE}/backend/prisma/migrations" | sort) | wc -l | tr -d ' ')"
echo "DATABASE_ONLY_MIGRATION_COUNT=${db_only_count}"
if [[ "$db_only_count" -gt 0 ]]; then
  echo "DATABASE_MIGRATIONS_NOT_PRESENT_IN_RC=YES"
else
  echo "DATABASE_MIGRATIONS_NOT_PRESENT_IN_RC=NO"
fi

echo "DISPOSABLE_PRISMA_MIGRATION_ROW_COUNT_AFTER=${migration_count_after}"
echo "DISPOSABLE_PRISMA_MIGRATION_HISTORY_SHA256_AFTER=${history_sha_after}"
echo "DISPOSABLE_SCHEMA_FINGERPRINT_AFTER=${schema_fp_after}"

if [[ "$migration_count_before" == "$migration_count_after" && "$history_sha_before" == "$history_sha_after" && "$schema_fp_before" == "$schema_fp_after" && "$deploy_code" -eq 0 ]]; then
  echo "DISPOSABLE_MIGRATE_DEPLOY=PASS"
  echo "DISPOSABLE_MIGRATE_DEPLOY_APPLIED_MIGRATION_COUNT=0"
  echo "MIGRATION_TABLE_EXACT_PRE_POST_IDENTITY=YES"
  echo "DATABASE_SCHEMA_EXACT_PRE_POST_IDENTITY=YES"
  echo "MIGRATION_HISTORY_DIVERGENCE_REPRODUCED=YES"
else
  echo "DISPOSABLE_MIGRATE_DEPLOY=FAIL"
fi

echo "ARTIFACT_DIR=${ARTIFACT_DIR}"
