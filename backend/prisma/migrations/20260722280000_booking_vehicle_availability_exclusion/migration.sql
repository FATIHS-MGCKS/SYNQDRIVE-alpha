-- Booking vehicle availability: buffer snapshot + GiST exclusion constraint (Prompt 11).
-- Half-open intervals [start_date, end_date + turnaround_buffer_minutes).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD COLUMN "turnaround_buffer_minutes" INTEGER NOT NULL DEFAULT 60;

-- Backfill from tenant insight policy handoverBufferMin where configured.
UPDATE "bookings" b
SET "turnaround_buffer_minutes" = COALESCE(
  NULLIF((tip."policy_overrides"->>'handoverBufferMin')::integer, NULL),
  60
)
FROM "tenant_insight_policies" tip
WHERE tip."organization_id" = b."organization_id";

-- Ops report: buffer-aware overlaps among blocking statuses (no booking deletion).
CREATE TABLE "booking_availability_overlap_reports" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "booking_a_id" TEXT NOT NULL,
  "booking_b_id" TEXT NOT NULL,
  "booking_a_start" TIMESTAMPTZ NOT NULL,
  "booking_a_end" TIMESTAMPTZ NOT NULL,
  "booking_a_buffer_minutes" INTEGER NOT NULL,
  "booking_b_start" TIMESTAMPTZ NOT NULL,
  "booking_b_end" TIMESTAMPTZ NOT NULL,
  "booking_b_buffer_minutes" INTEGER NOT NULL,
  "detected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_availability_overlap_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_availability_overlap_reports_org_vehicle_idx"
  ON "booking_availability_overlap_reports"("organization_id", "vehicle_id");

INSERT INTO "booking_availability_overlap_reports" (
  "id",
  "organization_id",
  "vehicle_id",
  "booking_a_id",
  "booking_b_id",
  "booking_a_start",
  "booking_a_end",
  "booking_a_buffer_minutes",
  "booking_b_start",
  "booking_b_end",
  "booking_b_buffer_minutes"
)
SELECT
  gen_random_uuid()::text,
  a."organization_id",
  a."vehicle_id",
  a."id",
  b."id",
  a."start_date",
  a."end_date",
  a."turnaround_buffer_minutes",
  b."start_date",
  b."end_date",
  b."turnaround_buffer_minutes"
FROM "bookings" a
JOIN "bookings" b
  ON a."organization_id" = b."organization_id"
  AND a."vehicle_id" = b."vehicle_id"
  AND a."id" < b."id"
WHERE a."status" IN ('PENDING', 'CONFIRMED', 'ACTIVE')
  AND b."status" IN ('PENDING', 'CONFIRMED', 'ACTIVE')
  AND a."start_date" < (
    b."end_date" + make_interval(mins => b."turnaround_buffer_minutes")
  )
  AND b."start_date" < (
    a."end_date" + make_interval(mins => a."turnaround_buffer_minutes")
  );

-- Add exclusion constraint only when no pre-existing blocking overlaps were detected.
DO $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count FROM "booking_availability_overlap_reports";

  IF conflict_count = 0 THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_availability_excl"
      EXCLUDE USING gist (
        "organization_id" WITH =,
        "vehicle_id" WITH =,
        tstzrange(
          "start_date",
          "end_date" + make_interval(mins => "turnaround_buffer_minutes"),
          '[)'
        ) WITH &&
      )
      WHERE ("status" IN ('PENDING', 'CONFIRMED', 'ACTIVE'));
    RAISE NOTICE 'Added bookings_vehicle_availability_excl exclusion constraint';
  ELSE
    RAISE WARNING
      'Skipped bookings_vehicle_availability_excl — % overlap(s) logged in booking_availability_overlap_reports. Application advisory locks remain active.',
      conflict_count;
  END IF;
END $$;
