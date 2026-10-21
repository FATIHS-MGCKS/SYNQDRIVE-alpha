-- Trip Route Architecture V2 (R1) — canonical 1:1 route artifact per trip.
-- Additive only: no existing row rewrites, no backfill.

CREATE TYPE "RouteQuality" AS ENUM ('MATCHED', 'FILTERED', 'RAW');

CREATE TABLE "vehicle_trip_route_artifacts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "route_quality" "RouteQuality" NOT NULL,
    "matched_geometry_json" JSONB,
    "filtered_geometry_json" JSONB,
    "match_confidence" DOUBLE PRECISION,
    "match_coverage" DOUBLE PRECISION,
    "provider" TEXT,
    "algorithm_version" TEXT NOT NULL,
    "input_fingerprint" TEXT NOT NULL,
    "source_point_count" INTEGER NOT NULL,
    "filtered_point_count" INTEGER NOT NULL DEFAULT 0,
    "matched_point_count" INTEGER,
    "chunk_count" INTEGER,
    "failed_chunk_count" INTEGER,
    "processed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "diagnostics_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_trip_route_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_trip_route_artifacts_trip_id_key"
    ON "vehicle_trip_route_artifacts"("trip_id");

CREATE INDEX "vehicle_trip_route_artifacts_organization_id_vehicle_id_idx"
    ON "vehicle_trip_route_artifacts"("organization_id", "vehicle_id");

CREATE INDEX "vehicle_trip_route_artifacts_input_fingerprint_idx"
    ON "vehicle_trip_route_artifacts"("input_fingerprint");

CREATE INDEX "vehicle_trip_route_artifacts_algorithm_version_idx"
    ON "vehicle_trip_route_artifacts"("algorithm_version");

ALTER TABLE "vehicle_trip_route_artifacts"
    ADD CONSTRAINT "vehicle_trip_route_artifacts_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_trip_route_artifacts"
    ADD CONSTRAINT "vehicle_trip_route_artifacts_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant / scope guard: organization, vehicle, and trip must align.
CREATE OR REPLACE FUNCTION vehicle_trip_route_artifact_scope_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vehicles v
    WHERE v.id = NEW.vehicle_id
      AND v.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'vehicle_trip_route_artifacts: vehicle % does not belong to organization %',
      NEW.vehicle_id, NEW.organization_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vehicle_trips t
    WHERE t.id = NEW.trip_id
      AND t.vehicle_id = NEW.vehicle_id
  ) THEN
    RAISE EXCEPTION 'vehicle_trip_route_artifacts: trip % does not belong to vehicle %',
      NEW.trip_id, NEW.vehicle_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vehicle_trip_route_artifact_scope_guard_trg
    BEFORE INSERT OR UPDATE ON "vehicle_trip_route_artifacts"
    FOR EACH ROW
    EXECUTE FUNCTION vehicle_trip_route_artifact_scope_guard();
