-- V4.6.76 Rental Health V1 — extend VehicleComplaint so operators can
-- classify complaints by impact (SAFETY/DRIVABILITY/ENVIRONMENT/COMFORT)
-- and run a richer lifecycle (OPEN/IN_REVIEW/CONFIRMED/REJECTED on top of
-- the legacy ACTIVE/RESOLVED states). Both additions are optional and
-- backwards-compatible: pre-existing rows keep urgency + ACTIVE status,
-- new rows can opt into the richer classification.

-- CreateEnum
CREATE TYPE "ComplaintImpact" AS ENUM ('SAFETY', 'DRIVABILITY', 'ENVIRONMENT', 'COMFORT');

-- AlterEnum
ALTER TYPE "ComplaintLifecycleStatus" ADD VALUE 'OPEN';
ALTER TYPE "ComplaintLifecycleStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "ComplaintLifecycleStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "ComplaintLifecycleStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "vehicle_complaints" ADD COLUMN "impact" "ComplaintImpact";
