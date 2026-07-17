#!/usr/bin/env bash
# Staging brake-health rollout — run on host with PostgreSQL access (VPS or CI).
# Creates an isolated DB copy, backup, migrate, and read-only audits before production deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT/backend"

STAGING_DB="${BRAKE_STAGING_DB_NAME:-synqdrive_staging_brake}"
SOURCE_DB="${BRAKE_SOURCE_DB_NAME:-synqdrive}"
BACKUP_DIR="${BRAKE_STAGING_BACKUP_DIR:-/opt/synqdrive/shared/backups}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

echo "==> 1. Backup source database: ${SOURCE_DB}"
mkdir -p "$BACKUP_DIR"
sudo -u postgres pg_dump "$SOURCE_DB" | gzip > "${BACKUP_DIR}/pre-brake-staging-${TS}.sql.gz"

echo "==> 2. Create staging copy: ${STAGING_DB}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${STAGING_DB};"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${STAGING_DB} OWNER synqdrive;"
sudo -u postgres pg_dump "$SOURCE_DB" | sudo -u postgres psql -v ON_ERROR_STOP=1 "$STAGING_DB"

export DATABASE_URL="postgresql://synqdrive@localhost:5432/${STAGING_DB}?schema=public"

echo "==> 3. Migrate status"
npx prisma migrate status

echo "==> 4. Migrate deploy + generate"
npm run prisma:migrate:deploy
npx prisma generate

echo "==> 5. Read-only baseline audit (first org sample)"
BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/audit-brake-health-baseline-candidates.ts \
  --limit=100 \
  --output-dir=../docs/audits/data/staging-${TS}

echo "==> Staging rollout complete. DATABASE_URL=${STAGING_DB}"
echo "Review audit output before production deploy via vps-deploy-release.sh"
