-- Brake component installation lifecycle (Prompt 6)
-- Additive only — no backfill of existing BrakeHealthCurrent into installations.
-- Partial unique index managed here (not expressible in schema.prisma).

CREATE TYPE "BrakeComponentInstallationType" AS ENUM (
  'FRONT_PADS',
  'REAR_PADS',
  'FRONT_DISCS',
  'REAR_DISCS'
);

CREATE TYPE "BrakeComponentInstallationStatus" AS ENUM (
  'ACTIVE',
  'REMOVED',
  'UNKNOWN_HISTORY',
  'RETIRED'
);

CREATE TYPE "BrakeComponentInstallationAnchorSource" AS ENUM (
  'MEASURED',
  'DOCUMENTED_REPLACEMENT',
  'SPEC_NOMINAL',
  'REGISTRATION_ASSERTION',
  'UNKNOWN'
);

CREATE TABLE "brake_component_installations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "component_type" "BrakeComponentInstallationType" NOT NULL,
  "installed_at" TIMESTAMP(3) NOT NULL,
  "installed_odometer_km" DOUBLE PRECISION,
  "removed_at" TIMESTAMP(3),
  "removed_odometer_km" DOUBLE PRECISION,
  "status" "BrakeComponentInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
  "anchor_thickness_mm" DOUBLE PRECISION,
  "anchor_source" "BrakeComponentInstallationAnchorSource",
  "anchor_measured_at" TIMESTAMP(3),
  "nominal_thickness_mm" DOUBLE PRECISION,
  "minimum_thickness_mm" DOUBLE PRECISION,
  "reference_spec_id" TEXT,
  "service_event_id" TEXT,
  "source_evidence_id" TEXT,
  "model_version_at_installation" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "brake_component_installations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brake_component_installations_organization_id_vehicle_id_idx"
  ON "brake_component_installations"("organization_id", "vehicle_id");

CREATE INDEX "brake_component_installations_vehicle_id_component_type_instal_idx"
  ON "brake_component_installations"("vehicle_id", "component_type", "installed_at");

CREATE INDEX "brake_component_installations_vehicle_id_status_idx"
  ON "brake_component_installations"("vehicle_id", "status");

CREATE INDEX "brake_component_installations_service_event_id_idx"
  ON "brake_component_installations"("service_event_id");

CREATE INDEX "brake_component_installations_source_evidence_id_idx"
  ON "brake_component_installations"("source_evidence_id");

CREATE INDEX "brake_component_installations_reference_spec_id_idx"
  ON "brake_component_installations"("reference_spec_id");

-- At most one ACTIVE installation per vehicle + component type.
CREATE UNIQUE INDEX "brake_component_installations_one_active_per_vehicle_component"
  ON "brake_component_installations"("vehicle_id", "component_type")
  WHERE "status" = 'ACTIVE' AND "removed_at" IS NULL;

ALTER TABLE "brake_component_installations"
  ADD CONSTRAINT "brake_component_installations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brake_component_installations"
  ADD CONSTRAINT "brake_component_installations_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "brake_component_installations"
  ADD CONSTRAINT "brake_component_installations_reference_spec_id_fkey"
  FOREIGN KEY ("reference_spec_id") REFERENCES "vehicle_brake_reference_specs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brake_component_installations"
  ADD CONSTRAINT "brake_component_installations_service_event_id_fkey"
  FOREIGN KEY ("service_event_id") REFERENCES "vehicle_service_events"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brake_component_installations"
  ADD CONSTRAINT "brake_component_installations_source_evidence_id_fkey"
  FOREIGN KEY ("source_evidence_id") REFERENCES "brake_evidence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
