-- CreateEnum
CREATE TYPE "DimoBrakingEventIntakeStatus" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'DUPLICATE',
  'SKIPPED_UNSUPPORTED',
  'SKIPPED_WRONG_VEHICLE',
  'FAILED'
);

-- CreateTable
CREATE TABLE "dimo_braking_event_intakes" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'DIMO',
  "provider_event_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "token_id" INTEGER NOT NULL,
  "event_type" "DrivingEventType" NOT NULL,
  "event_timestamp" TIMESTAMP(3) NOT NULL,
  "severity" DOUBLE PRECISION NOT NULL,
  "raw_source_version" TEXT NOT NULL,
  "source_fingerprint" TEXT NOT NULL,
  "trip_id" TEXT,
  "dimo_event_name" TEXT NOT NULL,
  "counter_value" INTEGER,
  "processing_status" "DimoBrakingEventIntakeStatus" NOT NULL DEFAULT 'RECEIVED',
  "driving_event_id" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "dimo_braking_event_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dimo_braking_event_intakes_provider_provider_event_id_key"
  ON "dimo_braking_event_intakes"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "dimo_braking_event_intakes_driving_event_id_key"
  ON "dimo_braking_event_intakes"("driving_event_id");

-- CreateIndex
CREATE INDEX "dimo_braking_event_intakes_vehicle_id_idx"
  ON "dimo_braking_event_intakes"("vehicle_id");

-- CreateIndex
CREATE INDEX "dimo_braking_event_intakes_organization_id_idx"
  ON "dimo_braking_event_intakes"("organization_id");

-- CreateIndex
CREATE INDEX "dimo_braking_event_intakes_trip_id_idx"
  ON "dimo_braking_event_intakes"("trip_id");

-- CreateIndex
CREATE INDEX "dimo_braking_event_intakes_event_timestamp_idx"
  ON "dimo_braking_event_intakes"("event_timestamp");

-- CreateIndex
CREATE INDEX "dimo_braking_event_intakes_processing_status_idx"
  ON "dimo_braking_event_intakes"("processing_status");

-- AddForeignKey
ALTER TABLE "dimo_braking_event_intakes"
  ADD CONSTRAINT "dimo_braking_event_intakes_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dimo_braking_event_intakes"
  ADD CONSTRAINT "dimo_braking_event_intakes_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dimo_braking_event_intakes"
  ADD CONSTRAINT "dimo_braking_event_intakes_driving_event_id_fkey"
  FOREIGN KEY ("driving_event_id") REFERENCES "driving_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
