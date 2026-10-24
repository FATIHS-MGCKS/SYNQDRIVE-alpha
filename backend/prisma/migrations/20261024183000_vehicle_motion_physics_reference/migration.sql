-- CreateEnum
CREATE TYPE "MotionPhysicsEvidenceTier" AS ENUM ('ESTIMATED', 'CONFIRMED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "MotionPhysicsReferenceSource" AS ENUM ('MISTRAL_AI', 'OPERATOR_CONFIRMED', 'MANUAL_ENTRY', 'ONBOARDING_ACTIVATION', 'REGISTRATION_CERTIFICATE', 'MANUFACTURER_VERIFIED');

-- CreateTable
CREATE TABLE "vehicle_motion_physics_references" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "identity_fingerprint_json" JSONB NOT NULL,
    "curb_mass_kg" DOUBLE PRECISION,
    "system_motor_power_kw" DOUBLE PRECISION,
    "system_power_definition" TEXT,
    "accel_0_to_100_s" DOUBLE PRECISION,
    "variant_assumption" TEXT,
    "evidence_tier" "MotionPhysicsEvidenceTier" NOT NULL,
    "source" "MotionPhysicsReferenceSource" NOT NULL,
    "document_extraction_id" TEXT,
    "verified_by_user_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "superseded_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_motion_physics_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_motion_physics_reference_changes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "reference_id" TEXT,
    "action" TEXT NOT NULL,
    "previous_tier" "MotionPhysicsEvidenceTier",
    "new_tier" "MotionPhysicsEvidenceTier",
    "actor_user_id" TEXT,
    "metadata" JSONB,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_motion_physics_reference_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_references_organization_id_idx" ON "vehicle_motion_physics_references"("organization_id");

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_references_vehicle_id_effective_from_idx" ON "vehicle_motion_physics_references"("vehicle_id", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_references_evidence_tier_idx" ON "vehicle_motion_physics_references"("evidence_tier");

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_references_is_active_idx" ON "vehicle_motion_physics_references"("is_active");

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_references_document_extraction_id_idx" ON "vehicle_motion_physics_references"("document_extraction_id");

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_references_superseded_by_id_idx" ON "vehicle_motion_physics_references"("superseded_by_id");

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_reference_changes_organization_id_idx" ON "vehicle_motion_physics_reference_changes"("organization_id");

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_reference_changes_vehicle_id_changed_at_idx" ON "vehicle_motion_physics_reference_changes"("vehicle_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "vehicle_motion_physics_reference_changes_reference_id_idx" ON "vehicle_motion_physics_reference_changes"("reference_id");

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_references" ADD CONSTRAINT "vehicle_motion_physics_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_references" ADD CONSTRAINT "vehicle_motion_physics_references_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_references" ADD CONSTRAINT "vehicle_motion_physics_references_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_references" ADD CONSTRAINT "vehicle_motion_physics_references_document_extraction_id_fkey" FOREIGN KEY ("document_extraction_id") REFERENCES "vehicle_document_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_references" ADD CONSTRAINT "vehicle_motion_physics_references_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "vehicle_motion_physics_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_reference_changes" ADD CONSTRAINT "vehicle_motion_physics_reference_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_reference_changes" ADD CONSTRAINT "vehicle_motion_physics_reference_changes_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_reference_changes" ADD CONSTRAINT "vehicle_motion_physics_reference_changes_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "vehicle_motion_physics_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_motion_physics_reference_changes" ADD CONSTRAINT "vehicle_motion_physics_reference_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
