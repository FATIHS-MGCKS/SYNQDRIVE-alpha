-- Prompt 54/78: list filters for org station summaries (status/type/primary/search)
CREATE INDEX "stations_organization_id_type_idx" ON "stations"("organization_id", "type");
CREATE INDEX "stations_organization_id_is_primary_idx" ON "stations"("organization_id", "is_primary");
