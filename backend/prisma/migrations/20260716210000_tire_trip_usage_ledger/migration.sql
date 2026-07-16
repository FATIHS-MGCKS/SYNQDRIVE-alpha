-- Tire trip usage ledger (Prompt 9) — additive, not for unattended production apply.
-- Source of truth for attributed tire-set trip usage; idempotent via (trip_id, tire_setup_id) + source_fingerprint.

CREATE TABLE "tire_trip_usage_ledger" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "tire_setup_id" TEXT NOT NULL,
    "trip_started_at" TIMESTAMP(3) NOT NULL,
    "trip_ended_at" TIMESTAMP(3),
    "distance_km" DOUBLE PRECISION NOT NULL,
    "city_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rural_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "highway_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "harsh_acceleration_count" INTEGER NOT NULL DEFAULT 0,
    "harsh_braking_count" INTEGER NOT NULL DEFAULT 0,
    "harsh_cornering_count" INTEGER NOT NULL DEFAULT 0,
    "driving_impact_summary" JSONB,
    "source_version" TEXT NOT NULL,
    "source_fingerprint" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tire_trip_usage_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tire_trip_usage_ledger_trip_id_tire_setup_id_key"
    ON "tire_trip_usage_ledger"("trip_id", "tire_setup_id");

CREATE INDEX "tire_trip_usage_ledger_tire_setup_id_trip_started_at_idx"
    ON "tire_trip_usage_ledger"("tire_setup_id", "trip_started_at");

CREATE INDEX "tire_trip_usage_ledger_vehicle_id_trip_started_at_idx"
    ON "tire_trip_usage_ledger"("vehicle_id", "trip_started_at");

CREATE INDEX "tire_trip_usage_ledger_organization_id_vehicle_id_idx"
    ON "tire_trip_usage_ledger"("organization_id", "vehicle_id");

CREATE INDEX "tire_trip_usage_ledger_trip_id_idx"
    ON "tire_trip_usage_ledger"("trip_id");

CREATE INDEX "tire_trip_usage_ledger_source_fingerprint_idx"
    ON "tire_trip_usage_ledger"("source_fingerprint");

ALTER TABLE "tire_trip_usage_ledger"
    ADD CONSTRAINT "tire_trip_usage_ledger_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tire_trip_usage_ledger"
    ADD CONSTRAINT "tire_trip_usage_ledger_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tire_trip_usage_ledger"
    ADD CONSTRAINT "tire_trip_usage_ledger_tire_setup_id_fkey"
    FOREIGN KEY ("tire_setup_id") REFERENCES "vehicle_tire_setups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant / scope guard: organization, vehicle, setup and trip must align.
CREATE OR REPLACE FUNCTION tire_trip_usage_ledger_scope_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = NEW.vehicle_id
      AND v.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'tire_trip_usage_ledger: vehicle % does not belong to organization %',
      NEW.vehicle_id, NEW.organization_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vehicle_tire_setups s
    WHERE s.id = NEW.tire_setup_id
      AND s.vehicle_id = NEW.vehicle_id
  ) THEN
    RAISE EXCEPTION 'tire_trip_usage_ledger: tire setup % does not belong to vehicle %',
      NEW.tire_setup_id, NEW.vehicle_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM vehicle_tire_setups s
    WHERE s.id = NEW.tire_setup_id
      AND s.organization_id IS NOT NULL
      AND s.organization_id <> NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'tire_trip_usage_ledger: tire setup organization mismatch for setup %',
      NEW.tire_setup_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vehicle_trips t
    WHERE t.id = NEW.trip_id
      AND t.vehicle_id = NEW.vehicle_id
  ) THEN
    RAISE EXCEPTION 'tire_trip_usage_ledger: trip % does not belong to vehicle %',
      NEW.trip_id, NEW.vehicle_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tire_trip_usage_ledger_scope_guard_trg
  BEFORE INSERT OR UPDATE ON tire_trip_usage_ledger
  FOR EACH ROW
  EXECUTE FUNCTION tire_trip_usage_ledger_scope_guard();
