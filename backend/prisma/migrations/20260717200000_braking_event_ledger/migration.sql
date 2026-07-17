-- CreateEnum
CREATE TYPE "BrakingEventCanonicalType" AS ENUM (
  'MODERATE_BRAKING',
  'HARSH_BRAKING',
  'EXTREME_BRAKING',
  'FULL_BRAKING',
  'HIGH_SPEED_BRAKING',
  'ABS_INTERVENTION',
  'UNKNOWN_BRAKING_EVENT'
);

CREATE TYPE "BrakingEventPrimarySource" AS ENUM (
  'DIMO_PROVIDER',
  'SYNQDRIVE_HF_BRAKING',
  'SYNQDRIVE_HF_ABUSE',
  'DERIVED_DECELERATION',
  'TRIP_AGGREGATION'
);

-- CreateTable
CREATE TABLE "braking_event_ledger" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "canonical_type" "BrakingEventCanonicalType" NOT NULL,
  "severity" DOUBLE PRECISION NOT NULL,
  "primary_source" "BrakingEventPrimarySource" NOT NULL,
  "provider_event_id" TEXT,
  "source_fingerprint" TEXT NOT NULL,
  "correlated_source_ids" JSONB NOT NULL DEFAULT '[]',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "dedupe_window_ms" INTEGER NOT NULL DEFAULT 2000,
  "peak_deceleration_ms2" DOUBLE PRECISION,
  "start_speed_kmh" DOUBLE PRECISION,
  "invalidated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "braking_event_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "braking_event_ledger_organization_id_source_fingerprint_key"
  ON "braking_event_ledger"("organization_id", "source_fingerprint");

-- CreateIndex
CREATE INDEX "braking_event_ledger_vehicle_id_occurred_at_idx"
  ON "braking_event_ledger"("vehicle_id", "occurred_at");

-- CreateIndex
CREATE INDEX "braking_event_ledger_trip_id_idx"
  ON "braking_event_ledger"("trip_id");

-- CreateIndex
CREATE INDEX "braking_event_ledger_organization_id_idx"
  ON "braking_event_ledger"("organization_id");

-- CreateIndex
CREATE INDEX "braking_event_ledger_canonical_type_idx"
  ON "braking_event_ledger"("canonical_type");

-- AddForeignKey
ALTER TABLE "braking_event_ledger"
  ADD CONSTRAINT "braking_event_ledger_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "braking_event_ledger"
  ADD CONSTRAINT "braking_event_ledger_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
