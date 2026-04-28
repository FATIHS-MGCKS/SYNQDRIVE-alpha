-- V4.6.77 High Mobility Compatibility Matrix — Master Admin internal
-- compatibility intelligence. Brand/model/model-year records + per-app
-- signal coverage rows feed an internal compatibility checker that is
-- reusable later for landing-page compatibility and onboarding guidance.
--
-- Additive migration: no existing data is touched. All new objects are
-- namespaced under hm_compatibility_* tables and Hm*Compatibility enums.

-- CreateEnum
CREATE TYPE "HmCompatibilityEligibilityMode" AS ENUM (
  'AVAILABLE',
  'NOT_AVAILABLE',
  'SUPPORT_REQUEST',
  'VIN_DEPENDENT'
);

-- CreateEnum
CREATE TYPE "HmCompatibilityOnboardingMode" AS ENUM (
  'PRECHECK_CONNECT',
  'DIRECT_CONNECT',
  'MANUAL_REVIEW'
);

-- CreateEnum
CREATE TYPE "HmCompatibilityAppStatus" AS ENUM (
  'SUPPORTED',
  'PARTIAL',
  'NOT_RECOMMENDED'
);

-- CreateEnum
CREATE TYPE "HmCompatibilityOverall" AS ENUM (
  'GOOD',
  'LIMITED',
  'WEAK'
);

-- CreateEnum
CREATE TYPE "HmCompatibilityConfidence" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW'
);

-- CreateEnum
CREATE TYPE "HmCompatibilityApp" AS ENUM (
  'HEALTH',
  'TELEMETRY'
);

-- CreateEnum
CREATE TYPE "HmSignalCoverage" AS ENUM (
  'CONFIRMED',
  'EXPECTED',
  'UNVERIFIED',
  'MISSING'
);

-- CreateTable
CREATE TABLE "hm_compatibility_records" (
  "id"                    TEXT                             NOT NULL,
  "brand"                 TEXT                             NOT NULL,
  "brand_display_name"    TEXT                             NOT NULL,
  "model"                 TEXT                             NOT NULL,
  "model_display_name"    TEXT                             NOT NULL,
  "model_year_from"       INTEGER,
  "model_year_to"         INTEGER,
  "support_from_text"     TEXT,
  "eligibility_mode"      "HmCompatibilityEligibilityMode" NOT NULL,
  "onboarding_mode"       "HmCompatibilityOnboardingMode"  NOT NULL,
  "health_app_status"     "HmCompatibilityAppStatus",
  "telemetry_app_status"  "HmCompatibilityAppStatus",
  "overall_status"        "HmCompatibilityOverall",
  "support_source"        TEXT,
  "confidence"            "HmCompatibilityConfidence"      NOT NULL DEFAULT 'MEDIUM',
  "notes"                 TEXT,
  "last_reviewed_at"      TIMESTAMP(3),
  "created_at"            TIMESTAMP(3)                     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3)                     NOT NULL,

  CONSTRAINT "hm_compatibility_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hm_compatibility_signals" (
  "id"                        TEXT                        NOT NULL,
  "compatibility_record_id"   TEXT                        NOT NULL,
  "app"                       "HmCompatibilityApp"        NOT NULL,
  "signal_key"                TEXT                        NOT NULL,
  "signal_label"              TEXT                        NOT NULL,
  "signal_group"              TEXT                        NOT NULL,
  "required"                  BOOLEAN                     NOT NULL DEFAULT true,
  "coverage"                  "HmSignalCoverage"          NOT NULL,
  "confidence"                "HmCompatibilityConfidence" NOT NULL DEFAULT 'MEDIUM',
  "notes"                     TEXT,
  "display_order"             INTEGER                     NOT NULL DEFAULT 0,
  "created_at"                TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3)                NOT NULL,

  CONSTRAINT "hm_compatibility_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hm_compatibility_records_brand_model_model_year_from_model_year_to_key"
  ON "hm_compatibility_records" ("brand", "model", "model_year_from", "model_year_to");

-- CreateIndex
CREATE INDEX "hm_compatibility_records_brand_idx"
  ON "hm_compatibility_records" ("brand");

-- CreateIndex
CREATE INDEX "hm_compatibility_records_brand_model_idx"
  ON "hm_compatibility_records" ("brand", "model");

-- CreateIndex
CREATE INDEX "hm_compatibility_records_eligibility_mode_idx"
  ON "hm_compatibility_records" ("eligibility_mode");

-- CreateIndex
CREATE UNIQUE INDEX "hm_compatibility_signals_compatibility_record_id_app_signal_key_key"
  ON "hm_compatibility_signals" ("compatibility_record_id", "app", "signal_key");

-- CreateIndex
CREATE INDEX "hm_compatibility_signals_compatibility_record_id_idx"
  ON "hm_compatibility_signals" ("compatibility_record_id");

-- CreateIndex
CREATE INDEX "hm_compatibility_signals_app_idx"
  ON "hm_compatibility_signals" ("app");

-- CreateIndex
CREATE INDEX "hm_compatibility_signals_coverage_idx"
  ON "hm_compatibility_signals" ("coverage");

-- AddForeignKey
ALTER TABLE "hm_compatibility_signals"
  ADD CONSTRAINT "hm_compatibility_signals_compatibility_record_id_fkey"
  FOREIGN KEY ("compatibility_record_id")
  REFERENCES "hm_compatibility_records" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
