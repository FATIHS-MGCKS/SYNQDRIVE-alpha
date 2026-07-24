-- Revocation queue control — scoped queue actions, downstream notifications, scheduler pauses

CREATE TYPE "DataAuthorizationRevocationQueueActionType" AS ENUM (
  'REMOVED',
  'SUPPRESSED',
  'CHECKPOINT_REQUIRED',
  'ALREADY_REMOVED',
  'ENQUEUE_BLOCKED'
);

CREATE TYPE "DataAuthorizationRevocationQueueJobState" AS ENUM (
  'WAITING',
  'DELAYED',
  'PAUSED',
  'ACTIVE',
  'RETRY'
);

CREATE TYPE "DataAuthorizationDownstreamRevocationNotifyStatus" AS ENUM (
  'PENDING',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTER'
);

CREATE TABLE "data_authorization_revocation_queue_actions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "queue_name" TEXT NOT NULL,
  "job_id" TEXT,
  "job_state" "DataAuthorizationRevocationQueueJobState" NOT NULL,
  "action" "DataAuthorizationRevocationQueueActionType" NOT NULL,
  "scope_entity_type" TEXT,
  "scope_entity_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_authorization_revocation_queue_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_authorization_revocation_queue_actions_idempotency_key_key"
  ON "data_authorization_revocation_queue_actions"("idempotency_key");
CREATE INDEX "data_authorization_revocation_queue_actions_organization_id_workflow_id_idx"
  ON "data_authorization_revocation_queue_actions"("organization_id", "workflow_id");
CREATE INDEX "data_authorization_revocation_queue_actions_queue_name_created_at_idx"
  ON "data_authorization_revocation_queue_actions"("queue_name", "created_at");

ALTER TABLE "data_authorization_revocation_queue_actions"
  ADD CONSTRAINT "data_authorization_revocation_queue_actions_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "data_authorization_revocation_workflows"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "data_authorization_downstream_revocation_notifies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" "DataAuthorizationDownstreamRevocationNotifyStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 8,
  "last_error" TEXT,
  "delivered_at" TIMESTAMP(3),
  "dead_lettered_at" TIMESTAMP(3),
  "idempotency_key" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_authorization_downstream_revocation_notifies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_authorization_downstream_revocation_notifies_idempotency_key_key"
  ON "data_authorization_downstream_revocation_notifies"("idempotency_key");
CREATE INDEX "data_authorization_downstream_revocation_notifies_organization_id_status_idx"
  ON "data_authorization_downstream_revocation_notifies"("organization_id", "status");
CREATE INDEX "data_authorization_downstream_revocation_notifies_workflow_id_idx"
  ON "data_authorization_downstream_revocation_notifies"("workflow_id");

ALTER TABLE "data_authorization_downstream_revocation_notifies"
  ADD CONSTRAINT "data_authorization_downstream_revocation_notifies_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "data_authorization_revocation_workflows"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "data_authorization_scheduled_job_pauses" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "scheduler_key" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "paused_until" TIMESTAMP(3),
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_authorization_scheduled_job_pauses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_authorization_scheduled_job_pauses_idempotency_key_key"
  ON "data_authorization_scheduled_job_pauses"("idempotency_key");
CREATE INDEX "data_authorization_scheduled_job_pauses_organization_id_scheduler_key_idx"
  ON "data_authorization_scheduled_job_pauses"("organization_id", "scheduler_key");
