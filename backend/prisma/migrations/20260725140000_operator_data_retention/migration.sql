-- Operator App data retention: handover draft TTL store + booking evidence legal hold.

CREATE TABLE "operator_handover_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "kind" "HandoverKind" NOT NULL,
    "step_id" TEXT,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_handover_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operator_booking_evidence_legal_holds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "set_by_user_id" TEXT,
    "released_at" TIMESTAMP(3),
    "released_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_booking_evidence_legal_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operator_handover_drafts_organization_id_booking_id_kind_key" ON "operator_handover_drafts"("organization_id", "booking_id", "kind");

CREATE INDEX "operator_handover_drafts_organization_id_expires_at_idx" ON "operator_handover_drafts"("organization_id", "expires_at");

CREATE UNIQUE INDEX "operator_booking_evidence_legal_holds_booking_id_key" ON "operator_booking_evidence_legal_holds"("booking_id");

CREATE INDEX "operator_booking_evidence_legal_holds_organization_id_active_idx" ON "operator_booking_evidence_legal_holds"("organization_id", "active");

ALTER TABLE "operator_handover_drafts" ADD CONSTRAINT "operator_handover_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_handover_drafts" ADD CONSTRAINT "operator_handover_drafts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_booking_evidence_legal_holds" ADD CONSTRAINT "operator_booking_evidence_legal_holds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_booking_evidence_legal_holds" ADD CONSTRAINT "operator_booking_evidence_legal_holds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
