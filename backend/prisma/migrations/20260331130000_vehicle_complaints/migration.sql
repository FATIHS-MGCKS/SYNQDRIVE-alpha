-- CreateEnum
CREATE TYPE "ComplaintUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplaintLifecycleStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ComplaintSource" AS ENUM ('FIELD_AGENT', 'MANUAL');

-- CreateTable
CREATE TABLE "vehicle_complaints" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "description" TEXT NOT NULL,
    "urgency" "ComplaintUrgency" NOT NULL DEFAULT 'MEDIUM',
    "region" TEXT,
    "status" "ComplaintLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "ComplaintSource" NOT NULL DEFAULT 'MANUAL',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_complaints_vehicle_id_idx" ON "vehicle_complaints"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_complaints_organization_id_idx" ON "vehicle_complaints"("organization_id");

-- AddForeignKey
ALTER TABLE "vehicle_complaints" ADD CONSTRAINT "vehicle_complaints_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_complaints" ADD CONSTRAINT "vehicle_complaints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
