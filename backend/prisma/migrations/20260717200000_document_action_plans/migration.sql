-- Document Intake V2 P16: additive DocumentActionPlan model + partial unique current index.

CREATE TYPE "DocumentActionPlanStatus" AS ENUM (
  'DRAFT',
  'READY',
  'APPLYING',
  'PARTIALLY_APPLIED',
  'APPLIED',
  'APPLY_FAILED',
  'SUPERSEDED',
  'INVALIDATED',
  'ARCHIVE_ONLY'
);

CREATE TABLE "document_action_plans" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "extraction_id" TEXT NOT NULL,
  "plan_version" INTEGER NOT NULL,
  "input_fingerprint" TEXT NOT NULL,
  "status" "DocumentActionPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "apply_mode" "DocumentApplyMode" NOT NULL DEFAULT 'PREVIEW',
  "snapshot_json" JSONB NOT NULL,
  "summary" TEXT,
  "blocking_reasons" JSONB,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generated_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "confirmed_by_user_id" TEXT,
  "invalidated_at" TIMESTAMP(3),
  "invalidation_reason" TEXT,
  "supersedes_plan_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "document_action_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_action_plans_organization_id_created_at_idx"
  ON "document_action_plans" ("organization_id", "created_at");

CREATE INDEX "document_action_plans_organization_id_extraction_id_idx"
  ON "document_action_plans" ("organization_id", "extraction_id");

CREATE INDEX "document_action_plans_extraction_id_created_at_idx"
  ON "document_action_plans" ("extraction_id", "created_at");

CREATE INDEX "document_action_plans_extraction_id_status_idx"
  ON "document_action_plans" ("extraction_id", "status");

CREATE INDEX "document_action_plans_extraction_id_invalidated_at_idx"
  ON "document_action_plans" ("extraction_id", "invalidated_at");

CREATE INDEX "document_action_plans_input_fingerprint_idx"
  ON "document_action_plans" ("input_fingerprint");

CREATE INDEX "document_action_plans_supersedes_plan_id_idx"
  ON "document_action_plans" ("supersedes_plan_id");

-- Exactly one current (non-invalidated) plan per extraction + input fingerprint.
CREATE UNIQUE INDEX "document_action_plans_extraction_fingerprint_current_key"
  ON "document_action_plans" ("extraction_id", "input_fingerprint")
  WHERE "invalidated_at" IS NULL;

ALTER TABLE "document_action_plans"
  ADD CONSTRAINT "document_action_plans_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_action_plans"
  ADD CONSTRAINT "document_action_plans_extraction_id_fkey"
  FOREIGN KEY ("extraction_id") REFERENCES "vehicle_document_extractions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_action_plans"
  ADD CONSTRAINT "document_action_plans_confirmed_by_user_id_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_action_plans"
  ADD CONSTRAINT "document_action_plans_supersedes_plan_id_fkey"
  FOREIGN KEY ("supersedes_plan_id") REFERENCES "document_action_plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
