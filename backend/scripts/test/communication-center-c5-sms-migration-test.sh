#!/usr/bin/env bash
# Validates C5.1 SMS native migration against disposable PostgreSQL.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_c51_test?schema=public}"
PSQL_URL="${DATABASE_URL%%\?*}"
MIGRATION_SQL="$(dirname "$0")/../../prisma/migrations/20260821200000_communication_center_c5_sms_native/migration.sql"

echo "C5.1 SMS migration validation against ${DATABASE_URL}"

psql "$PSQL_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
);
SQL

psql "$PSQL_URL" -v ON_ERROR_STOP=1 -f "$MIGRATION_SQL"

psql "$PSQL_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO organizations (id, company_name) VALUES ('org-1', 'A'), ('org-2', 'B');
INSERT INTO org_sms_configs (id, organization_id, webhook_endpoint_id, updated_at)
VALUES ('cfg-1', 'org-1', 'wh-endpoint-1', NOW());
-- nullable unique allows second null endpoint
INSERT INTO org_sms_configs (id, organization_id, updated_at)
VALUES ('cfg-2', 'org-2', NOW());
-- duplicate non-null endpoint must fail
DO $$
BEGIN
  BEGIN
    INSERT INTO org_sms_configs (id, organization_id, webhook_endpoint_id, updated_at)
    VALUES ('cfg-3', 'org-2', 'wh-endpoint-1', NOW());
    RAISE EXCEPTION 'expected unique violation for webhook_endpoint_id';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;
SQL

echo "C5.1 SMS migration validation passed"
