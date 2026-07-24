-- Prompt 44/54 — backtesting, model registry, and drift monitoring

CREATE TYPE "PredictiveModelScopeMode" AS ENUM ('GLOBAL_SEGMENT', 'ORG_SPECIFIC');
CREATE TYPE "PredictiveModelRegistryStatus" AS ENUM ('DRAFT', 'SHADOW', 'APPROVED', 'DISABLED', 'ROLLED_BACK');
CREATE TYPE "PredictiveBacktestRunStatus" AS ENUM ('COMPLETED', 'PARTIAL', 'FAILED');
CREATE TYPE "PredictiveBacktestResultStatus" AS ENUM ('PASSED', 'FAILED', 'INSUFFICIENT_DATA');
CREATE TYPE "PredictiveDriftSeverity" AS ENUM ('STABLE', 'WARNING', 'CRITICAL');
CREATE TYPE "PredictiveDriftRecommendedAction" AS ENUM ('NONE', 'FALLBACK', 'DISABLE');

CREATE TABLE "org_predictive_model_registry" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "model_family" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "feature_set_version" TEXT NOT NULL,
    "scope_mode" "PredictiveModelScopeMode" NOT NULL,
    "scope_key" TEXT NOT NULL DEFAULT 'fleet',
    "horizon_days" INTEGER,
    "status" "PredictiveModelRegistryStatus" NOT NULL,
    "backtest_metrics" JSONB NOT NULL DEFAULT '{}',
    "release_gates" JSONB NOT NULL DEFAULT '[]',
    "last_backtest_at" TIMESTAMP(3),
    "last_drift_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "fallback_model_version" TEXT,
    "drift_severity" "PredictiveDriftSeverity",
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_predictive_model_registry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_predictive_backtest_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "model_family" TEXT NOT NULL,
    "feature_set_version" TEXT NOT NULL,
    "as_of_date" TEXT NOT NULL,
    "status" "PredictiveBacktestRunStatus" NOT NULL,
    "models_evaluated" INTEGER NOT NULL DEFAULT 0,
    "results_written" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "trigger" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "org_predictive_backtest_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_predictive_backtest_results" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "backtest_run_id" TEXT NOT NULL,
    "model_family" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "scope_mode" "PredictiveModelScopeMode" NOT NULL,
    "scope_key" TEXT NOT NULL DEFAULT 'fleet',
    "status" "PredictiveBacktestResultStatus" NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "baseline_metrics" JSONB NOT NULL DEFAULT '{}',
    "release_gates" JSONB NOT NULL DEFAULT '[]',
    "gates_passed" BOOLEAN NOT NULL DEFAULT false,
    "fold_count" INTEGER NOT NULL DEFAULT 0,
    "evaluated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_predictive_backtest_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_predictive_drift_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "model_family" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL DEFAULT 'fleet',
    "severity" "PredictiveDriftSeverity" NOT NULL,
    "recommended_action" "PredictiveDriftRecommendedAction" NOT NULL,
    "input_drift" JSONB NOT NULL DEFAULT '[]',
    "error_drift" JSONB NOT NULL DEFAULT '{}',
    "backtest_baseline" JSONB NOT NULL DEFAULT '{}',
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_predictive_drift_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_predictive_model_registry_org_family_key_version_scope_horizon_key"
  ON "org_predictive_model_registry"("organization_id", "model_family", "model_key", "model_version", "scope_key", "horizon_days");

CREATE INDEX "org_predictive_model_registry_organization_id_model_key_status_idx"
  ON "org_predictive_model_registry"("organization_id", "model_key", "status");

CREATE INDEX "org_predictive_backtest_runs_organization_id_started_at_idx"
  ON "org_predictive_backtest_runs"("organization_id", "started_at");

CREATE UNIQUE INDEX "org_predictive_backtest_results_run_key_horizon_scope_key"
  ON "org_predictive_backtest_results"("backtest_run_id", "model_key", "horizon_days", "scope_key");

CREATE INDEX "org_predictive_backtest_results_organization_id_model_key_evaluated_at_idx"
  ON "org_predictive_backtest_results"("organization_id", "model_key", "evaluated_at");

CREATE INDEX "org_predictive_drift_snapshots_organization_id_model_key_evaluated_at_idx"
  ON "org_predictive_drift_snapshots"("organization_id", "model_key", "evaluated_at");

ALTER TABLE "org_predictive_model_registry"
  ADD CONSTRAINT "org_predictive_model_registry_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_predictive_backtest_runs"
  ADD CONSTRAINT "org_predictive_backtest_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_predictive_backtest_results"
  ADD CONSTRAINT "org_predictive_backtest_results_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_predictive_backtest_results"
  ADD CONSTRAINT "org_predictive_backtest_results_backtest_run_id_fkey"
  FOREIGN KEY ("backtest_run_id") REFERENCES "org_predictive_backtest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_predictive_drift_snapshots"
  ADD CONSTRAINT "org_predictive_drift_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
