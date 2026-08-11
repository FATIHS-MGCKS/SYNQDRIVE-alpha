-- Evaluations tenant-safe analytics foundation (E2)
-- Additive-only: new enums + one organization-owned normalized reference table.
-- No existing table is altered; no column is dropped or retyped.

-- CreateEnum
CREATE TYPE "EvaluationsReferenceOwnerType" AS ENUM ('INSIGHT', 'ANALYTICS_GROUP');

-- CreateEnum
CREATE TYPE "EvaluationsEntityType" AS ENUM ('VEHICLE', 'BOOKING', 'CUSTOMER', 'DRIVER', 'USER', 'INVOICE', 'PAYMENT', 'TASK', 'SERVICE_CASE', 'DAMAGE', 'DOCUMENT', 'STATION');

-- CreateEnum
CREATE TYPE "EvaluationsRelationType" AS ENUM ('PRIMARY_SUBJECT', 'CONTRIBUTOR', 'RELATED', 'SOURCE', 'IMPACTED');

-- CreateTable
CREATE TABLE "evaluations_entity_references" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "station_id" TEXT,
    "owner_type" "EvaluationsReferenceOwnerType" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "entity_type" "EvaluationsEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "relation_type" "EvaluationsRelationType" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_entity_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluations_entity_references_organization_id_idx" ON "evaluations_entity_references"("organization_id");

-- CreateIndex
CREATE INDEX "evaluations_entity_references_organization_id_entity_type_e_idx" ON "evaluations_entity_references"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "evaluations_entity_references_organization_id_station_id_idx" ON "evaluations_entity_references"("organization_id", "station_id");

-- CreateIndex
CREATE INDEX "evaluations_entity_references_organization_id_owner_type_ow_idx" ON "evaluations_entity_references"("organization_id", "owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "evaluations_entity_references_organization_id_created_at_idx" ON "evaluations_entity_references"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_entity_refs_org_dedupe_key" ON "evaluations_entity_references"("organization_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "evaluations_entity_references" ADD CONSTRAINT "evaluations_entity_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
