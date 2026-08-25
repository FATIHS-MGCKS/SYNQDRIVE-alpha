-- Additive provider-specific DIMO FK on vehicle_data_source_links.
-- Preserves existing HM source_reference_id → high_mobility_vehicles FK.

-- Allow NULL source_reference_id for DIMO rows (HM rows remain NOT NULL via CHECK).
ALTER TABLE "vehicle_data_source_links"
  ALTER COLUMN "source_reference_id" DROP NOT NULL;

ALTER TABLE "vehicle_data_source_links"
  ADD COLUMN "dimo_vehicle_id" TEXT;

ALTER TABLE "vehicle_data_source_links"
  ADD CONSTRAINT "vehicle_data_source_links_dimo_vehicle_id_fkey"
  FOREIGN KEY ("dimo_vehicle_id")
  REFERENCES "dimo_vehicles"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "vehicle_data_source_links_dimo_vehicle_id_idx"
  ON "vehicle_data_source_links"("dimo_vehicle_id");

-- One active DIMO mapping per DimoVehicle (cross-vehicle tenant safety complement).
CREATE UNIQUE INDEX "uq_vdsl_active_dimo_vehicle"
  ON "vehicle_data_source_links"("dimo_vehicle_id")
  WHERE "is_active" = true
    AND "provider" = 'DIMO'
    AND "dimo_vehicle_id" IS NOT NULL;

-- Provider-specific reference invariant (HM vs DIMO).
ALTER TABLE "vehicle_data_source_links"
  ADD CONSTRAINT "vehicle_data_source_links_provider_reference_check"
  CHECK (
    (
      "provider" = 'DIMO'
      AND "dimo_vehicle_id" IS NOT NULL
      AND "source_reference_id" IS NULL
    )
    OR
    (
      "provider" <> 'DIMO'
      AND "dimo_vehicle_id" IS NULL
      AND "source_reference_id" IS NOT NULL
    )
  );
