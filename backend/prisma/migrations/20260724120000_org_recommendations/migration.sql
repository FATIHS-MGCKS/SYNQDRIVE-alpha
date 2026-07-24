-- CreateEnum
CREATE TYPE "RecommendationSourceType" AS ENUM ('DASHBOARD_INSIGHT', 'EVALUATIONS_INSIGHT', 'EVALUATIONS_RISK', 'MISUSE_CASE', 'MANUAL');

-- CreateEnum
CREATE TYPE "RecommendationCategory" AS ENUM ('MAINTENANCE', 'SAFETY', 'COMPLIANCE', 'COST_OPTIMIZATION', 'FLEET_UTILIZATION', 'CUSTOMER_EXPERIENCE', 'OPERATIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RecommendationConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('NEW', 'REVIEWED', 'ACCEPTED', 'REJECTED', 'PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'MEASURING_IMPACT', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "org_recommendations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "source_type" "RecommendationSourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "category" "RecommendationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "expected_benefit_cents" INTEGER,
    "expected_benefit_currency" TEXT,
    "estimated_cost_cents" INTEGER,
    "estimated_cost_currency" TEXT,
    "expected_net_benefit_cents" INTEGER,
    "expected_net_benefit_currency" TEXT,
    "confidence" "RecommendationConfidence" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "affected_entities" JSONB NOT NULL DEFAULT '[]',
    "owner_id" TEXT,
    "due_at" TIMESTAMP(3),
    "status" "RecommendationStatus" NOT NULL DEFAULT 'NEW',
    "dedup_key" TEXT NOT NULL,
    "calculation_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_recommendation_events" (
    "id" TEXT NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "previous_status" "RecommendationStatus",
    "new_status" "RecommendationStatus",
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_recommendation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_recommendations_org_dedup_key" ON "org_recommendations"("organization_id", "dedup_key");

-- CreateIndex
CREATE INDEX "org_recommendations_organization_id_status_idx" ON "org_recommendations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "org_recommendations_organization_id_source_type_source_id_idx" ON "org_recommendations"("organization_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "org_recommendations_organization_id_owner_id_idx" ON "org_recommendations"("organization_id", "owner_id");

-- CreateIndex
CREATE INDEX "org_recommendations_organization_id_due_at_idx" ON "org_recommendations"("organization_id", "due_at");

-- CreateIndex
CREATE INDEX "org_recommendation_events_recommendation_id_created_at_idx" ON "org_recommendation_events"("recommendation_id", "created_at");

-- CreateIndex
CREATE INDEX "org_recommendation_events_organization_id_created_at_idx" ON "org_recommendation_events"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "org_recommendations" ADD CONSTRAINT "org_recommendations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_recommendation_events" ADD CONSTRAINT "org_recommendation_events_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "org_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_recommendation_events" ADD CONSTRAINT "org_recommendation_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
