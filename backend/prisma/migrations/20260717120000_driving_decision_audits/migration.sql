-- Driving Intelligence V2 P73 — manual decision audit trail

CREATE TYPE "DrivingDecisionSubjectType" AS ENUM ('CUSTOMER', 'BOOKING', 'TRIP', 'VEHICLE');

CREATE TYPE "DrivingDecisionAuditAction" AS ENUM (
  'APPROVE',
  'CONDITIONAL',
  'REJECT',
  'DISMISS',
  'INSPECTION_REQUESTED'
);

CREATE TABLE "driving_decision_audits" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "subject_type" "DrivingDecisionSubjectType" NOT NULL,
  "subject_id" TEXT NOT NULL,
  "decision" "DrivingDecisionAuditAction" NOT NULL,
  "recommendation_at_decision" "DrivingDecisionRecommendation" NOT NULL,
  "dimensions_snapshot_json" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "decided_by_user_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_user_id" TEXT,
  "revoke_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driving_decision_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driving_decision_audits_organization_id_subject_type_subject_id_idx"
  ON "driving_decision_audits"("organization_id", "subject_type", "subject_id");

CREATE INDEX "driving_decision_audits_organization_id_decided_at_idx"
  ON "driving_decision_audits"("organization_id", "decided_at");

ALTER TABLE "driving_decision_audits"
  ADD CONSTRAINT "driving_decision_audits_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_decision_audits"
  ADD CONSTRAINT "driving_decision_audits_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driving_decision_audits"
  ADD CONSTRAINT "driving_decision_audits_revoked_by_user_id_fkey"
  FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
