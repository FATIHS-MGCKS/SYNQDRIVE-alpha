-- Prompt 42/54 — baseline predictive forecasts (demand, revenue, utilization)

CREATE TYPE "PredictiveForecastTarget" AS ENUM ('DEMAND', 'REVENUE', 'UTILIZATION');

CREATE TYPE "PredictiveForecastStatus" AS ENUM (
  'AVAILABLE',
  'INSUFFICIENT_HISTORY',
  'SUPPRESSED',
  'FALLBACK'
);

CREATE TYPE "PredictiveInferenceTier" AS ENUM ('RULE_BASED', 'STATISTICAL');

CREATE TYPE "PredictiveForecastRunStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED');

CREATE TABLE "org_predictive_forecasts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "forecast_key" "PredictiveForecastTarget" NOT NULL,
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
    "point_estimate" DOUBLE PRECISION NOT NULL,
    "interval_low" DOUBLE PRECISION NOT NULL,
    "interval_high" DOUBLE PRECISION NOT NULL,
    "training_window_start" TEXT NOT NULL,
    "training_window_end" TEXT NOT NULL,
    "data_coverage_percent" DOUBLE PRECISION NOT NULL,
    "evaluation_metrics" JSONB NOT NULL DEFAULT '{}',
    "explainability" JSONB NOT NULL DEFAULT '{}',
    "status" "PredictiveForecastStatus" NOT NULL,
    "suppressed_reason" TEXT,
    "lineage" JSONB NOT NULL DEFAULT '{}',
    "forecast_run_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "org_predictive_forecasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_predictive_forecast_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "feature_set_version" TEXT NOT NULL,
    "as_of_date" TEXT NOT NULL,
    "status" "PredictiveForecastRunStatus" NOT NULL,
    "forecasts_written" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "trigger" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "org_predictive_forecast_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_predictive_forecasts_org_key_horizon_scope_asof_key"
  ON "org_predictive_forecasts"("organization_id", "forecast_key", "horizon_days", "scope_key", "as_of_date");

CREATE INDEX "org_predictive_forecasts_organization_id_as_of_date_idx"
  ON "org_predictive_forecasts"("organization_id", "as_of_date");

CREATE INDEX "org_predictive_forecasts_organization_id_forecast_key_horizon_days_idx"
  ON "org_predictive_forecasts"("organization_id", "forecast_key", "horizon_days");

CREATE INDEX "org_predictive_forecast_runs_organization_id_started_at_idx"
  ON "org_predictive_forecast_runs"("organization_id", "started_at");

ALTER TABLE "org_predictive_forecasts"
  ADD CONSTRAINT "org_predictive_forecasts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_predictive_forecasts"
  ADD CONSTRAINT "org_predictive_forecasts_forecast_run_id_fkey"
  FOREIGN KEY ("forecast_run_id") REFERENCES "org_predictive_forecast_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "org_predictive_forecast_runs"
  ADD CONSTRAINT "org_predictive_forecast_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
