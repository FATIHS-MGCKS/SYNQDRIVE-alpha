-- CreateEnum
CREATE TYPE "OperatorUploadKind" AS ENUM ('DAMAGE_IMAGE', 'CONDITION_PHOTO', 'DOCUMENT', 'SIGNATURE', 'OBSERVATION_IMAGE', 'TIRE_EVIDENCE');

-- CreateEnum
CREATE TYPE "OperatorUploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "operator_uploads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "client_upload_id" TEXT NOT NULL,
    "kind" "OperatorUploadKind" NOT NULL,
    "status" "OperatorUploadStatus" NOT NULL DEFAULT 'PENDING',
    "booking_id" TEXT NOT NULL,
    "handover_session_id" TEXT,
    "vehicle_id" TEXT NOT NULL,
    "handover_kind" "HandoverKind",
    "mime_type" TEXT,
    "file_name" TEXT,
    "file_size_bytes" INTEGER,
    "content_sha256" TEXT,
    "storage_payload" JSONB,
    "target_ref_type" TEXT,
    "target_ref_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_attempt_at" TIMESTAMP(3),
    "progress_percent" INTEGER,
    "required_for_complete" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_user_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operator_uploads_organization_id_client_upload_id_key" ON "operator_uploads"("organization_id", "client_upload_id");

-- CreateIndex
CREATE INDEX "operator_uploads_organization_id_booking_id_idx" ON "operator_uploads"("organization_id", "booking_id");

-- CreateIndex
CREATE INDEX "operator_uploads_handover_session_id_idx" ON "operator_uploads"("handover_session_id");

-- CreateIndex
CREATE INDEX "operator_uploads_status_expires_at_idx" ON "operator_uploads"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "operator_uploads" ADD CONSTRAINT "operator_uploads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_uploads" ADD CONSTRAINT "operator_uploads_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_uploads" ADD CONSTRAINT "operator_uploads_handover_session_id_fkey" FOREIGN KEY ("handover_session_id") REFERENCES "booking_handover_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_uploads" ADD CONSTRAINT "operator_uploads_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
