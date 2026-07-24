-- Prompt 39/54 — versioned impact measurements for org recommendations

CREATE TYPE "RecommendationImpactOutcomeStatus" AS ENUM (
  'INSUFFICIENT_DATA',
  'INCONCLUSIVE',
  'PARTIAL_SUCCESS',
  'SUCCESS',
  'BELOW_EXPECTATION',
  'NEGATIVE',
  'CANCELLED',
  'PARTIALLY_IMPLEMENTED'
);

CREATE TYPE "RecommendationImplementationStatus" AS ENUM (
  'FULL',
  'PARTIAL',
  'CANCELLED',
  'NOT_STARTED'
);

CREATE TYPE "RecommendationImpactTrend" AS ENUM (
  'IMPROVING',
  'STABLE',
  'DECLINING',
  'UNKNOWN'
);

CREATE TABLE "org_recommendation_impacts" (
    "id" TEXT NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "baseline_kpi_key" TEXT NOT NULL,
    "baseline_kpi_label" TEXT,
    "baseline_value" DOUBLE PRECISION,
    "target_value" DOUBLE PRECISION,
    "actual_kpi_value" DOUBLE PRECISION,
    "expected_benefit_cents" INTEGER,
    "expected_benefit_currency" TEXT,
    "expected_cost_cents" INTEGER,
    "expected_cost_currency" TEXT,
    "actual_cost_cents" INTEGER,
    "actual_cost_currency" TEXT,
    "actual_benefit_cents" INTEGER,
    "actual_benefit_currency" TEXT,
    "variance_cents" INTEGER,
    "variance_currency" TEXT,
    "baseline_period_start" TIMESTAMP(3) NOT NULL,
    "baseline_period_end" TIMESTAMP(3) NOT NULL,
    "measurement_period_start" TIMESTAMP(3) NOT NULL,
    "measurement_period_end" TIMESTAMP(3) NOT NULL,
    "data_coverage_percent" DOUBLE PRECISION,
    "outcome_status" "RecommendationImpactOutcomeStatus" NOT NULL,
    "implementation_status" "RecommendationImplementationStatus" NOT NULL,
    "trend" "RecommendationImpactTrend" NOT NULL,
    "confidence" "RecommendationConfidence" NOT NULL,
    "calculation_version" TEXT NOT NULL,
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "deviation_explanation" TEXT,
    "correlation_disclaimer" TEXT NOT NULL,
    "period_comparable" BOOLEAN NOT NULL DEFAULT false,
    "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_recommendation_impacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_recommendation_impacts_recommendation_id_version_key"
  ON "org_recommendation_impacts"("recommendation_id", "version");

CREATE INDEX "org_recommendation_impacts_organization_id_recommendation_id_is_latest_idx"
  ON "org_recommendation_impacts"("organization_id", "recommendation_id", "is_latest");

ALTER TABLE "org_recommendation_impacts"
  ADD CONSTRAINT "org_recommendation_impacts_recommendation_id_fkey"
  FOREIGN KEY ("recommendation_id") REFERENCES "org_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_recommendation_impacts"
  ADD CONSTRAINT "org_recommendation_impacts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
