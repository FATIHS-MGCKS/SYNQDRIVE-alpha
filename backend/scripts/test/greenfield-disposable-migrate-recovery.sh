#!/usr/bin/env bash
# Opt-in greenfield Prisma migrate deploy on disposable localhost PostgreSQL.
# Does NOT repair native unassisted `prisma migrate deploy` — uses recovery-assisted path.
#
# Required:
#   SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1
#   DATABASE_URL=postgresql://...@127.0.0.1:.../<disposable-db>
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ "${SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY:-}" != "1" ]]; then
  echo "SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1 is required" >&2
  exit 41
fi

# shellcheck source=../ops/lib/production-database-identity-guard.lib.sh
source "${ROOT}/scripts/ops/lib/production-database-identity-guard.lib.sh"
export SYNQDRIVE_DATABASE_IDENTITY_PROFILE=ephemeral
pdb_guard_assert_ephemeral_database_url "${DATABASE_URL:-}"

DB_NAME="$(pdb_guard_url_field "${DATABASE_URL}" 4)"
case "$DB_NAME" in
  synqdrive_product_catalog_p2_pr1|synqdrive_p3_pr1_core_app_m2m|synqdrive_p2_pr3_vehicle_access|synqdrive_p11_fresh_cert|synqdrive_p12_*|synqdrive_greenfield_*)
    ;;
  *)
    echo "greenfield recovery: database name not allowlisted (${DB_NAME})" >&2
    exit 42
    ;;
esac

if ! psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -tAc 'SELECT 1' >/dev/null 2>&1; then
  echo "greenfield recovery: cannot connect to DATABASE_URL (refusing writes)" >&2
  exit 44
fi

HAS_MIGRATION_TABLE="$(
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -tAc "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    )
  " | tr -d '[:space:]'
)"
if [[ "${HAS_MIGRATION_TABLE}" == "t" ]]; then
  ROWS="$(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -tAc 'SELECT COUNT(*)::bigint FROM _prisma_migrations' | tr -d '[:space:]')"
else
  ROWS="0"
fi
if [[ "${ROWS}" != "0" ]]; then
  echo "greenfield recovery: _prisma_migrations already has ${ROWS} rows (populated DB refused)" >&2
  exit 43
fi

export PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1

echo "==> greenfield recovery-assisted migrate deploy (resilient runner)"
bash "${ROOT}/scripts/test/prisma-migrate-deploy-resilient.sh"

echo "==> verify batch_c indexes"
npx ts-node scripts/test/verify-composite-indexes-batch-c.ts

echo "==> prisma migrate status"
node "${ROOT}/scripts/ops/lib/prisma-cli-guard.mjs" migrate status

echo "==> idempotent redeploy"
bash "${ROOT}/scripts/test/prisma-migrate-deploy-resilient.sh"

echo "GREENFIELD_MIGRATE_RECOVERY=PASS db=${DB_NAME}"