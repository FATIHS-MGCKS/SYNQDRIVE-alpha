#!/usr/bin/env bash
# Opt-in greenfield Prisma migrate deploy on disposable localhost PostgreSQL.
# Does NOT repair native unassisted `prisma migrate deploy` — uses recovery-assisted path.
#
# Required:
#   SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1
#   DATABASE_URL=postgresql://...@127.0.0.1:.../<disposable-db>
#
# Optional:
#   SYNQDRIVE_GREENFIELD_REQUIRE_EMPTY_DB=1  (default 1) — refuse if _prisma_migrations has rows
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

if [[ "${SYNQDRIVE_GREENFIELD_REQUIRE_EMPTY_DB:-1}" == "1" ]]; then
  ROWS="$(psql "${DATABASE_URL}" -tAc 'SELECT COUNT(*) FROM _prisma_migrations' 2>/dev/null | tr -d ' ' || true)"
  if [[ -n "${ROWS}" && "${ROWS}" != "0" ]]; then
    echo "greenfield recovery: _prisma_migrations already has ${ROWS} rows (set SYNQDRIVE_GREENFIELD_REQUIRE_EMPTY_DB=0 to override)" >&2
    exit 43
  fi
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