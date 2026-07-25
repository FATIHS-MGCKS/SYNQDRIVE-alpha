-- CreateTable
CREATE TABLE "booking_handover_drafts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "kind" "HandoverKind" NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_handover_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_handover_drafts_organization_id_idx" ON "booking_handover_drafts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_handover_drafts_booking_id_kind_user_id_key" ON "booking_handover_drafts"("booking_id", "kind", "user_id");

-- AddForeignKey
ALTER TABLE "booking_handover_drafts" ADD CONSTRAINT "booking_handover_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_handover_drafts" ADD CONSTRAINT "booking_handover_drafts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
