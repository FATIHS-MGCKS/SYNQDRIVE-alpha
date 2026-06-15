-- Misuse / Abuse Cases — informational Prüffälle (read-only, no workflow status)

DO $$ BEGIN
  CREATE TYPE "MisuseCaseCategory" AS ENUM (
    'USAGE_ANOMALY', 'MISUSE_SUSPICION', 'TECHNICAL_RISK',
    'DAMAGE_SUSPICION', 'TAMPERING_DATA_INTEGRITY'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MisuseCaseType" AS ENUM (
    'AGGRESSIVE_DRIVING_PATTERN', 'COLD_ENGINE_ABUSE', 'REPEATED_ENGINE_REV_IN_IDLE',
    'LAUNCH_ABUSE_PATTERN', 'BRAKE_ABUSE_PATTERN', 'POSSIBLE_COLLISION_OR_IMPACT',
    'DIMO_COLLISION_REPORTED', 'OVERHEATING_DAMAGE_RISK', 'DTC_AFTER_ABUSE_OR_IMPACT',
    'TELEMETRY_INTEGRITY_ISSUE', 'TAMPERING_SUSPECTED', 'EV_BATTERY_STRESS_PATTERN',
    'RENTAL_GEOFENCE_VIOLATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MisuseCaseSeverity" AS ENUM ('INFO', 'WARNING', 'SEVERE', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MisuseCaseConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MisuseAttributionScope" AS ENUM (
    'BOOKING_CUSTOMER', 'ASSIGNED_DRIVER', 'VEHICLE_ONLY', 'PRIVATE_UNASSIGNED', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MisuseEvidenceSourceType" AS ENUM (
    'TRIP_BEHAVIOR_EVENT', 'DRIVING_EVENT', 'DIMO_EVENT', 'DTC',
    'VEHICLE_TRIP_COUNTER', 'VEHICLE_LATEST_STATE', 'DERIVED_PATTERN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "misuse_cases" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "booking_id" TEXT,
  "customer_id" TEXT,
  "category" "MisuseCaseCategory" NOT NULL,
  "type" "MisuseCaseType" NOT NULL,
  "severity" "MisuseCaseSeverity" NOT NULL,
  "confidence" "MisuseCaseConfidence" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "recommended_action" TEXT,
  "attribution_scope" "MisuseAttributionScope" NOT NULL,
  "assignment_status_snapshot" "TripAssignmentStatus",
  "assignment_subject_type_snapshot" "TripAssignmentSubjectType",
  "assignment_subject_id_snapshot" TEXT,
  "assigned_booking_id_snapshot" TEXT,
  "is_private_trip_snapshot" BOOLEAN NOT NULL DEFAULT false,
  "first_detected_at" TIMESTAMP(3) NOT NULL,
  "last_detected_at" TIMESTAMP(3) NOT NULL,
  "event_count" INTEGER NOT NULL DEFAULT 1,
  "evidence_summary" JSONB,
  "fingerprint" TEXT NOT NULL,
  "informational_only" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "misuse_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "misuse_cases_fingerprint_key" ON "misuse_cases"("fingerprint");
CREATE INDEX IF NOT EXISTS "misuse_cases_organization_id_idx" ON "misuse_cases"("organization_id");
CREATE INDEX IF NOT EXISTS "misuse_cases_vehicle_id_idx" ON "misuse_cases"("vehicle_id");
CREATE INDEX IF NOT EXISTS "misuse_cases_trip_id_idx" ON "misuse_cases"("trip_id");
CREATE INDEX IF NOT EXISTS "misuse_cases_booking_id_idx" ON "misuse_cases"("booking_id");
CREATE INDEX IF NOT EXISTS "misuse_cases_customer_id_idx" ON "misuse_cases"("customer_id");
CREATE INDEX IF NOT EXISTS "misuse_cases_category_idx" ON "misuse_cases"("category");
CREATE INDEX IF NOT EXISTS "misuse_cases_type_idx" ON "misuse_cases"("type");
CREATE INDEX IF NOT EXISTS "misuse_cases_severity_idx" ON "misuse_cases"("severity");
CREATE INDEX IF NOT EXISTS "misuse_cases_last_detected_at_idx" ON "misuse_cases"("last_detected_at");

DO $$ BEGIN
  ALTER TABLE "misuse_cases"
    ADD CONSTRAINT "misuse_cases_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "misuse_cases"
    ADD CONSTRAINT "misuse_cases_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "misuse_cases"
    ADD CONSTRAINT "misuse_cases_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "misuse_cases"
    ADD CONSTRAINT "misuse_cases_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "misuse_cases"
    ADD CONSTRAINT "misuse_cases_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "misuse_case_evidence" (
  "id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "source_type" "MisuseEvidenceSourceType" NOT NULL,
  "source_id" TEXT,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "booking_id" TEXT,
  "customer_id" TEXT,
  "event_type" TEXT NOT NULL,
  "severity" "MisuseCaseSeverity",
  "confidence" "MisuseCaseConfidence",
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "snapshot_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "misuse_case_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "misuse_case_evidence_case_id_idx" ON "misuse_case_evidence"("case_id");
CREATE INDEX IF NOT EXISTS "misuse_case_evidence_organization_id_idx" ON "misuse_case_evidence"("organization_id");
CREATE INDEX IF NOT EXISTS "misuse_case_evidence_vehicle_id_idx" ON "misuse_case_evidence"("vehicle_id");
CREATE INDEX IF NOT EXISTS "misuse_case_evidence_trip_id_idx" ON "misuse_case_evidence"("trip_id");
CREATE INDEX IF NOT EXISTS "misuse_case_evidence_source_type_source_id_idx" ON "misuse_case_evidence"("source_type", "source_id");

DO $$ BEGIN
  ALTER TABLE "misuse_case_evidence"
    ADD CONSTRAINT "misuse_case_evidence_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "misuse_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
