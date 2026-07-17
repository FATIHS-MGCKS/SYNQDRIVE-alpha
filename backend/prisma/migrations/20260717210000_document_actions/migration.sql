-- Document Intake V2 P17: additive DocumentAction model.

CREATE TABLE "document_actions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "extraction_id" TEXT NOT NULL,
  "action_plan_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "action_type" "DocumentActionType" NOT NULL,
  "status" "DocumentActionStatus" NOT NULL DEFAULT 'WOULD_APPLY',
  "requirement" "DocumentActionRequirement" NOT NULL DEFAULT 'REQUIRED',
  "target_entity_type" "DocumentEntityType",
  "target_entity_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "input_payload" JSONB NOT NULL,
  "preview_payload" JSONB,
  "result_entity_type" "DocumentEntityType",
  "result_entity_id" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "document_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_actions_organization_id_idempotency_key_key"
  ON "document_actions" ("organization_id", "idempotency_key");

CREATE UNIQUE INDEX "document_actions_action_plan_id_sequence_key"
  ON "document_actions" ("action_plan_id", "sequence");

CREATE INDEX "document_actions_organization_id_action_plan_id_idx"
  ON "document_actions" ("organization_id", "action_plan_id");

CREATE INDEX "document_actions_organization_id_extraction_id_idx"
  ON "document_actions" ("organization_id", "extraction_id");

CREATE INDEX "document_actions_action_plan_id_status_idx"
  ON "document_actions" ("action_plan_id", "status");

CREATE INDEX "document_actions_extraction_id_action_type_idx"
  ON "document_actions" ("extraction_id", "action_type");

CREATE INDEX "document_actions_target_entity_type_target_entity_id_idx"
  ON "document_actions" ("target_entity_type", "target_entity_id");

ALTER TABLE "document_actions"
  ADD CONSTRAINT "document_actions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_actions"
  ADD CONSTRAINT "document_actions_extraction_id_fkey"
  FOREIGN KEY ("extraction_id") REFERENCES "vehicle_document_extractions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_actions"
  ADD CONSTRAINT "document_actions_action_plan_id_fkey"
  FOREIGN KEY ("action_plan_id") REFERENCES "document_action_plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
