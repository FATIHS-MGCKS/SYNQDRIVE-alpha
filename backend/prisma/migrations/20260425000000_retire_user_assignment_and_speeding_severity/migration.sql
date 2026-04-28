-- V4.6.95 — Scoring Architecture Hardening
--
-- This migration retires three dead paths from the scoring system:
--   1. `TripAssignmentStatus.ASSIGNED_USER`
--   2. `TripAssignmentSubjectType.USER`
--   3. `TripDrivingImpact.speedingSeverityScore` (write path silenced in V4.6.83)
--
-- PostgreSQL does not support `ALTER TYPE … DROP VALUE`, so we use the
-- standard rename-rebuild-rename pattern: create a new enum type with only
-- the surviving values, repoint columns onto it, and drop the old type.

-- ── 1) TripAssignmentStatus: drop ASSIGNED_USER ─────────────────────────────
-- Preserve any existing rows that may still carry ASSIGNED_USER by mapping
-- them to UNKNOWN_ASSIGNMENT. The corresponding subject id column is also
-- nulled out below to keep the row internally consistent.
UPDATE "VehicleTrip"
SET
  "assignment_status" = 'UNKNOWN_ASSIGNMENT',
  "assignment_subject_type" = NULL,
  "assignment_subject_id"   = NULL
WHERE "assignment_status"::text = 'ASSIGNED_USER';

ALTER TYPE "TripAssignmentStatus" RENAME TO "TripAssignmentStatus_old";

CREATE TYPE "TripAssignmentStatus" AS ENUM (
  'ASSIGNED_DRIVER',
  'ASSIGNED_BOOKING_CUSTOMER',
  'PRIVATE_UNASSIGNED',
  'UNKNOWN_ASSIGNMENT'
);

ALTER TABLE "VehicleTrip"
  ALTER COLUMN "assignment_status" TYPE "TripAssignmentStatus"
  USING ("assignment_status"::text::"TripAssignmentStatus");

DROP TYPE "TripAssignmentStatus_old";

-- ── 2) TripAssignmentSubjectType: drop USER ─────────────────────────────────
-- Any remaining rows pointing USER subject get their subject info cleared
-- (defensive — the VehicleTrip update above already handled the typical case).
UPDATE "VehicleTrip"
SET
  "assignment_subject_type" = NULL,
  "assignment_subject_id"   = NULL
WHERE "assignment_subject_type"::text = 'USER';

ALTER TYPE "TripAssignmentSubjectType" RENAME TO "TripAssignmentSubjectType_old";

CREATE TYPE "TripAssignmentSubjectType" AS ENUM (
  'DRIVER',
  'BOOKING_CUSTOMER'
);

ALTER TABLE "VehicleTrip"
  ALTER COLUMN "assignment_subject_type" TYPE "TripAssignmentSubjectType"
  USING ("assignment_subject_type"::text::"TripAssignmentSubjectType");

DROP TYPE "TripAssignmentSubjectType_old";

-- ── 3) TripDrivingImpact: drop deprecated speedingSeverityScore ─────────────
-- The column was last written by the legacy `maxOverSpeedKmh*1.1 +
-- avgOverSpeedKmh*1.4` formula (V4.6.82 and earlier). V4.6.83 silenced the
-- write path because `safetyScore` is the canonical speeding-related scalar.
-- No consumer has read it since; dropping the column completes the cleanup.
ALTER TABLE "TripDrivingImpact"
  DROP COLUMN IF EXISTS "speeding_severity_score";
