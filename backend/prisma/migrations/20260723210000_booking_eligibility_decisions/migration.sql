-- CreateEnum
CREATE TYPE "BookingEligibilityDecisionEventType" AS ENUM (
  'CONFIRM_ATTEMPT',
  'CONFIRM_SUCCEEDED',
  'CONFIRM_REJECTED',
  'PICKUP_CHECK',
  'MANUAL_APPROVAL_APPROVED',
  'MANUAL_APPROVAL_REJECTED'
);

-- CreateTable
CREATE TABLE "booking_eligibility_decisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "event_type" "BookingEligibilityDecisionEventType" NOT NULL,
    "decision_status" TEXT NOT NULL,
    "reason_codes" JSONB NOT NULL DEFAULT '[]',
    "blocking_reasons" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "missing_fields" JSONB NOT NULL DEFAULT '[]',
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "recheck_at" TIMESTAMP(3),
    "engine_version" TEXT NOT NULL,
    "rule_revision_ids" JSONB NOT NULL DEFAULT '[]',
    "rules_hash" TEXT NOT NULL,
    "derived_facts" JSONB NOT NULL DEFAULT '{}',
    "data_sources" JSONB NOT NULL DEFAULT '{}',
    "manual_approval_id" TEXT,
    "booking_data_version" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "evaluation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_eligibility_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_eligibility_decisions_org_booking_created_idx"
    ON "booking_eligibility_decisions"("organization_id", "booking_id", "created_at");

CREATE INDEX "booking_eligibility_decisions_org_booking_event_idx"
    ON "booking_eligibility_decisions"("organization_id", "booking_id", "event_type");

CREATE INDEX "booking_eligibility_decisions_org_rules_hash_created_idx"
    ON "booking_eligibility_decisions"("organization_id", "rules_hash", "created_at");

CREATE INDEX "booking_eligibility_decisions_org_correlation_idx"
    ON "booking_eligibility_decisions"("organization_id", "correlation_id");

ALTER TABLE "booking_eligibility_decisions"
    ADD CONSTRAINT "booking_eligibility_decisions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_eligibility_decisions"
    ADD CONSTRAINT "booking_eligibility_decisions_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
