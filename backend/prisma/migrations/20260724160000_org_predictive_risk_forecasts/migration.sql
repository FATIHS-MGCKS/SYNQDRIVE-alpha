-- Prompt 43/54 — maintenance, failure, and cost risk forecasts

CREATE TYPE "PredictiveRiskTarget" AS ENUM (
  'MAINTENANCE_COST',
  'UNPLANNED_FAILURE',
  'EXPECTED_DOWNTIME',
  'CAPACITY_RISK',
  'COST_RISK'
);

CREATE TYPE "PredictiveRiskForecastStatus" AS ENUM (
  'AVAILABLE',
  'INSUFFICIENT_DATA',
  'SUPPRESSED',
  'FALLBACK'
);

CREATE TYPE "PredictiveRiskForecastRunStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED');

CREATE TABLE "org_predictive_risk_forecasts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "risk_key" "PredictiveRiskTarget" NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "model_version" TEXT NOT NULL,
    "feature_set_version" TEXT NOT NULL,
    "inference_tier" "PredictiveInferenceTier" NOT NULL,
    "scope_key" TEXT NOT NULL DEFAULT 'fleet',
    "timezone" TEXT NOT NULL,
    "currency" TEXT,
    "unit" TEXT NOT NULL,
    "as_of_date" TEXT NOT NULL,
    "horizon_start_date" TEXT NOT NULL,
    "horizon_end_date" TEXT NOT NULL,
    "probability_estimate" DOUBLE PRECISION,
    "impact_estimate" DOUBLE PRECISION,
    "cost_p50_minor" DOUBLE PRECISION,
    "cost_p90_minor" DOUBLE PRECISION,
    "point_estimate" DOUBLE PRECISION,
    "interval_low" DOUBLE PRECISION,
    "interval_high" DOUBLE PRECISION,
    "data_coverage_percent" DOUBLE PRECISION NOT NULL,
    "evaluation_metrics" JSONB NOT NULL DEFAULT '{}',
    "explainability" JSONB NOT NULL DEFAULT '{}',
    "safety_boundaries" JSONB NOT NULL DEFAULT '{}',
    "status" "PredictiveRiskForecastStatus" NOT NULL,
    "suppressed_reason" TEXT,
    "lineage" JSONB NOT NULL DEFAULT '{}',
    "risk_run_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "org_predictive_risk_forecasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_predictive_risk_forecast_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "feature_set_version" TEXT NOT NULL,
    "as_of_date" TEXT NOT NULL,
    "status" "PredictiveRiskForecastRunStatus" NOT NULL,
    "forecasts_written" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "trigger" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "org_predictive_risk_forecast_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_predictive_risk_forecasts_org_key_horizon_scope_asof_key"
  ON "org_predictive_risk_forecasts"("organization_id", "risk_key", "horizon_days", "scope_key", "as_of_date");

CREATE INDEX "org_predictive_risk_forecasts_organization_id_as_of_date_idx"
  ON "org_predictive_risk_forecasts"("organization_id", "as_of_date");

CREATE INDEX "org_predictive_risk_forecasts_organization_id_risk_key_horizon_days_idx"
  ON "org_predictive_risk_forecasts"("organization_id", "risk_key", "horizon_days");

CREATE INDEX "org_predictive_risk_forecast_runs_organization_id_started_at_idx"
  ON "org_predictive_risk_forecast_runs"("organization_id", "started_at");

ALTER TABLE "org_predictive_risk_forecasts"
  ADD CONSTRAINT "org_predictive_risk_forecasts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_predictive_risk_forecasts"
  ADD CONSTRAINT "org_predictive_risk_forecasts_risk_run_id_fkey"
  FOREIGN KEY ("risk_run_id") REFERENCES "org_predictive_risk_forecast_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "org_predictive_risk_forecast_runs"
  ADD CONSTRAINT "org_predictive_risk_forecast_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
