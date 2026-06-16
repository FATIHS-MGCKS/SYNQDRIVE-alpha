-- Customer list/filter indexes (archivedAt, status, riskLevel)
CREATE INDEX IF NOT EXISTS "customers_organization_id_archived_at_idx" ON "customers"("organization_id", "archived_at");
CREATE INDEX IF NOT EXISTS "customers_organization_id_status_idx" ON "customers"("organization_id", "status");
CREATE INDEX IF NOT EXISTS "customers_organization_id_risk_level_idx" ON "customers"("organization_id", "risk_level");
