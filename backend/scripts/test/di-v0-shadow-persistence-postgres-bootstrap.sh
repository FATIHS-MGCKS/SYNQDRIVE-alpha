#!/usr/bin/env bash
# DI V0 shadow persistence — ephemeral PostgreSQL bootstrap (migrate chain only).
# Schema.prisma may contain columns not yet in migrations; integration tests probe
# Vehicle.create and document drift via DI_V0_SHADOW_PG_SCHEMA_DRIFT_REPAIR=db-push.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

case "${DATABASE_URL,,}" in
  *127.0.0.1*|*localhost*) ;;
  *)
    echo "DATABASE_URL must target ephemeral local PostgreSQL" >&2
    exit 1
    ;;
esac

echo "==> prisma validate"
npx prisma validate

echo "==> prisma generate"
npx prisma generate

echo "==> prisma migrate deploy (resilient)"
PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1 bash scripts/test/prisma-migrate-deploy-resilient.sh

pending=$(npx prisma migrate status 2>&1 | grep -c 'have not yet been applied' || true)
if [[ "${pending:-0}" -gt 0 ]]; then
  echo "pending migrations remain after bootstrap" >&2
  exit 1
fi

if [[ "${DI_V0_SHADOW_PG_SCHEMA_DRIFT_REPAIR:-}" == "db-push" ]]; then
  echo "==> optional schema drift repair (db push) — not part of production migration path"
  npx prisma db push --accept-data-loss --skip-generate || true
fi

echo "DI V0 shadow persistence PostgreSQL bootstrap OK"
