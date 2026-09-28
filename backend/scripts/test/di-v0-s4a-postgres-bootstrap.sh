#!/usr/bin/env bash
# EXP-021 S4A — builds two ephemeral local databases for the S4A Postgres specs:
#   <prefix>_base : every migration up to (excluding) 20260927200000_di_v0_s4a_dormant_foundation
#   <prefix>_race : <prefix>_base + the S4A migration applied through `prisma migrate deploy`
# Requires DI_V0_S4A_PG_ADMIN_URL (role with CREATEDB on a local server, e.g. .../postgres).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

S4A_MIGRATION="20260927200000_di_v0_s4a_dormant_foundation"
PREFIX="${DI_V0_S4A_DB_PREFIX:-synqdrive_s4a}"
BASE_DB="${PREFIX}_base"
RACE_DB="${PREFIX}_race"

log() { printf '[di-v0-s4a-postgres-bootstrap] %s\n' "$*"; }

ADMIN_URL="${DI_V0_S4A_PG_ADMIN_URL:-}"
if [[ -z "$ADMIN_URL" ]]; then
  echo "DI_V0_S4A_PG_ADMIN_URL is required (local PostgreSQL admin connection)." >&2
  exit 1
fi
lower_url="${ADMIN_URL,,}"
case "$lower_url" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "DI_V0_S4A_PG_ADMIN_URL must target a local ephemeral PostgreSQL" >&2; exit 1 ;;
esac
case "$lower_url" in
  *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*) echo "production hosts are forbidden" >&2; exit 1 ;;
esac
if [[ ! "$PREFIX" =~ ^[a-z0-9_]{1,40}$ ]]; then
  echo "DI_V0_S4A_DB_PREFIX must match ^[a-z0-9_]{1,40}$" >&2
  exit 1
fi

db_url() {
  local db="$1"
  # Replace the database path segment, keep credentials, host and query string.
  node -e 'const u = new URL(process.argv[1]); u.pathname = "/" + process.argv[2]; process.stdout.write(u.toString())' "$ADMIN_URL" "$db"
}
psql_admin() { psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -qAt "$@"; }

recreate_db() {
  local db="$1" template="${2:-}"
  psql_admin -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)"
  if [[ -n "$template" ]]; then
    psql_admin -c "CREATE DATABASE \"$db\" TEMPLATE \"$template\""
  else
    psql_admin -c "CREATE DATABASE \"$db\""
  fi
}

log "creating $BASE_DB (all migrations, then S4A stripped)"
recreate_db "$BASE_DB"
BASE_URL="$(db_url "$BASE_DB")"
DATABASE_URL="${BASE_URL}?schema=public" PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh
psql "$BASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/test/di-v0-s4a-strip-to-pre-s4a.sql
leftover="$(psql "$BASE_URL" -qAt -c "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'di_v0_s4_%'")"
if [[ "$leftover" != "0" ]]; then
  echo "pre-S4A baseline still has S4 tables" >&2
  exit 1
fi

log "creating $RACE_DB from $BASE_DB and applying $S4A_MIGRATION via prisma migrate deploy"
recreate_db "$RACE_DB" "$BASE_DB"
RACE_URL="$(db_url "$RACE_DB")"
DEPLOY_LOG="$(mktemp /tmp/di-v0-s4a-deploy.XXXXXX.log)"
trap 'rm -f "$DEPLOY_LOG"' EXIT
DATABASE_URL="${RACE_URL}?schema=public" npx prisma migrate deploy 2>&1 | tee "$DEPLOY_LOG"
grep -q "$S4A_MIGRATION" "$DEPLOY_LOG" || { echo "S4A migration was not applied" >&2; exit 1; }
DATABASE_URL="${RACE_URL}?schema=public" npx prisma migrate deploy 2>&1 | tee "$DEPLOY_LOG"
grep -qE 'No pending migrations to apply' "$DEPLOY_LOG" || { echo "second deploy was not a no-op" >&2; exit 1; }

log "ready"
printf 'export DATABASE_URL=%q\n' "${RACE_URL}?schema=public"
printf 'export DI_V0_S4A_PG_ADMIN_URL=%q\n' "$ADMIN_URL"
printf 'export DI_V0_S4A_PG_TEMPLATE_DB=%q\n' "$BASE_DB"
