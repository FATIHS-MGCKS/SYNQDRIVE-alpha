-- Prompt 15: persistent manual-approval workflow for MANUAL_APPROVAL_REQUIRED

CREATE TYPE "BookingEligibilityApprovalStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REVOKED',
    'EXPIRED'
);

CREATE TABLE "booking_eligibility_approvals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "eligibility_decision" TEXT NOT NULL,
    "exception_reason" TEXT NOT NULL,
    "reason_codes" JSONB NOT NULL DEFAULT '[]',
    "status" "BookingEligibilityApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "gate_stage" TEXT NOT NULL,
    "target_booking_status" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "decided_by_user_id" TEXT,
    "decision_reason" TEXT,
    "eligibility_fingerprint" TEXT NOT NULL,
    "rule_revision" TEXT NOT NULL,
    "booking_data_version" TEXT NOT NULL,
    "gate_result_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_eligibility_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_eligibility_approvals_org_booking_created_idx"
    ON "booking_eligibility_approvals"("organization_id", "booking_id", "created_at");

CREATE INDEX "booking_eligibility_approvals_org_booking_status_idx"
    ON "booking_eligibility_approvals"("organization_id", "booking_id", "status");

CREATE INDEX "booking_eligibility_approvals_org_status_expires_idx"
    ON "booking_eligibility_approvals"("organization_id", "status", "expires_at");

ALTER TABLE "booking_eligibility_approvals"
    ADD CONSTRAINT "booking_eligibility_approvals_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_eligibility_approvals"
    ADD CONSTRAINT "booking_eligibility_approvals_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_eligibility_approvals"
    ADD CONSTRAINT "booking_eligibility_approvals_requested_by_user_id_fkey"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_eligibility_approvals"
    ADD CONSTRAINT "booking_eligibility_approvals_decided_by_user_id_fkey"
    FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
