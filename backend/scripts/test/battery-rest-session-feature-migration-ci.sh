#!/usr/bin/env bash
# M3.3C C1 — ephemeral PostgreSQL migration verification for battery_rest_session_features.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '[battery-rest-session-feature-migration-ci] %s\n' "$*"; }

assert_ephemeral_database_url() {
  local lower_url="${DATABASE_URL,,}"
  case "$lower_url" in
    *127.0.0.1*|*localhost*) ;;
    *)
      echo "DATABASE_URL must target ephemeral CI-local PostgreSQL" >&2
      exit 1
      ;;
  esac
  case "$lower_url" in
    *srv1374778*|*app.synqdrive.eu*|*hstgr.cloud*|*mein-vps*)
      echo "DATABASE_URL must not reference production hosts" >&2
      exit 1
      ;;
  esac
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (ephemeral PostgreSQL)." >&2
  exit 1
fi

assert_ephemeral_database_url

log "prisma migrate deploy (resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

log "verify enums/table/constraints"
npx ts-node --transpile-only scripts/test/battery-rest-session-feature-migration.verify.ts

log "prisma migrate deploy second pass (noop expected)"
SECOND_DEPLOY_LOG="$(mktemp /tmp/battery-rest-feature-second-deploy.XXXXXX.log)"
trap 'rm -f "$SECOND_DEPLOY_LOG"' EXIT
set +e
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh 2>&1 | tee "$SECOND_DEPLOY_LOG"
second_exit=${PIPESTATUS[0]}
set -e
if [[ "$second_exit" -ne 0 ]]; then
  echo "second prisma migrate deploy failed (exit $second_exit)" >&2
  exit 1
fi
if ! grep -qE 'No pending migrations to apply|All migrations have already been applied' "$SECOND_DEPLOY_LOG"; then
  echo "second deploy did not report noop/pending=0" >&2
  cat "$SECOND_DEPLOY_LOG" >&2
  exit 1
fi
log "MIGRATION_SECOND_DEPLOY=PASS_NOOP"

log "battery-rest-session-feature-migration-ci completed successfully"
