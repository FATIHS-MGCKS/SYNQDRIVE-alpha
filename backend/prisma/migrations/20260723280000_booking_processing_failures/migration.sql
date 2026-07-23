-- CreateEnum
CREATE TYPE "BookingProcessingFailureCategory" AS ENUM ('INVOICE', 'DOCUMENT', 'EMAIL', 'TASK', 'HANDOVER', 'CONFLICT', 'DETAIL_READ', 'SIDE_EFFECT', 'TENANT', 'OUTBOX', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingProcessingFailureSeverity" AS ENUM ('WARNING', 'ERROR', 'CRITICAL');

-- CreateTable
CREATE TABLE "booking_processing_failures" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "category" "BookingProcessingFailureCategory" NOT NULL,
    "operation" TEXT NOT NULL,
    "error_code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "correlation_id" TEXT,
    "request_id" TEXT,
    "event_id" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "severity" "BookingProcessingFailureSeverity" NOT NULL DEFAULT 'ERROR',
    "resolved_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_processing_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_processing_failures_organization_id_booking_id_idx" ON "booking_processing_failures"("organization_id", "booking_id");

-- CreateIndex
CREATE INDEX "booking_processing_failures_organization_id_category_resolved_a_idx" ON "booking_processing_failures"("organization_id", "category", "resolved_at");

-- CreateIndex
CREATE INDEX "booking_processing_failures_error_code_created_at_idx" ON "booking_processing_failures"("error_code", "created_at");

-- AddForeignKey
ALTER TABLE "booking_processing_failures" ADD CONSTRAINT "booking_processing_failures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_processing_failures" ADD CONSTRAINT "booking_processing_failures_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
