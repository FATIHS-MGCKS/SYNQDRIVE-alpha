-- CreateEnum
CREATE TYPE "DrivingAssessmentQualityStatus" AS ENUM ('NORMAL', 'DEGRADED', 'RECOVERING');

-- AlterEnum
ALTER TYPE "InsightType" ADD VALUE 'DRIVING_ASSESSMENT_DEVICE_QUALITY';

-- CreateTable
CREATE TABLE "vehicle_driving_assessment_quality" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "status" "DrivingAssessmentQualityStatus" NOT NULL DEFAULT 'NORMAL',
    "degraded_since" TIMESTAMP(3),
    "recovered_at" TIMESTAMP(3),
    "last_evaluated_at" TIMESTAMP(3) NOT NULL,
    "consecutive_normal_trips" INTEGER NOT NULL DEFAULT 0,
    "evidence_json" JSONB,
    "active_observation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_driving_assessment_quality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_driving_assessment_quality_vehicle_id_key" ON "vehicle_driving_assessment_quality"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_driving_assessment_quality_organization_id_idx" ON "vehicle_driving_assessment_quality"("organization_id");

-- CreateIndex
CREATE INDEX "vehicle_driving_assessment_quality_organization_id_status_idx" ON "vehicle_driving_assessment_quality"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "vehicle_driving_assessment_quality" ADD CONSTRAINT "vehicle_driving_assessment_quality_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_driving_assessment_quality" ADD CONSTRAINT "vehicle_driving_assessment_quality_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
