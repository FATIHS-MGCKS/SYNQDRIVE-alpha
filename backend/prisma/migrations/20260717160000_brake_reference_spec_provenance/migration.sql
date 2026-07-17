-- Brake reference spec provenance and nominal thickness semantics (Prompt 10)

CREATE TYPE "BrakeReferenceSpecEvidenceCategory" AS ENUM (
  'MANUFACTURER_CONFIRMED',
  'PART_CATALOG_CONFIRMED',
  'USER_CONFIRMED',
  'DOCUMENTED',
  'AI_ESTIMATED',
  'LEGACY_UNVERIFIED',
  'DEFAULT_ASSUMPTION',
  'UNKNOWN'
);

ALTER TABLE "vehicle_brake_reference_specs"
  ADD COLUMN "front_pad_nominal_thickness_mm" DOUBLE PRECISION,
  ADD COLUMN "rear_pad_nominal_thickness_mm" DOUBLE PRECISION,
  ADD COLUMN "front_disc_nominal_thickness_mm" DOUBLE PRECISION,
  ADD COLUMN "rear_disc_nominal_thickness_mm" DOUBLE PRECISION,
  ADD COLUMN "front_pad_evidence_category" "BrakeReferenceSpecEvidenceCategory",
  ADD COLUMN "rear_pad_evidence_category" "BrakeReferenceSpecEvidenceCategory",
  ADD COLUMN "front_disc_evidence_category" "BrakeReferenceSpecEvidenceCategory",
  ADD COLUMN "rear_disc_evidence_category" "BrakeReferenceSpecEvidenceCategory",
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "source_part_number" TEXT,
  ADD COLUMN "source_provider" TEXT,
  ADD COLUMN "source_retrieved_at" TIMESTAMP(3),
  ADD COLUMN "source_confidence" DOUBLE PRECISION,
  ADD COLUMN "user_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "user_confirmed_by" TEXT,
  ADD COLUMN "semantic_mapping_version" TEXT;

CREATE INDEX "vehicle_brake_reference_specs_vehicle_id_created_at_idx"
  ON "vehicle_brake_reference_specs"("vehicle_id", "created_at");

-- Backfill pad nominal thickness from legacy pad fields (semantic equivalent).
UPDATE "vehicle_brake_reference_specs"
SET
  "front_pad_nominal_thickness_mm" = "front_pad_thickness",
  "rear_pad_nominal_thickness_mm" = "rear_pad_thickness",
  "front_pad_evidence_category" = CASE
    WHEN "front_pad_thickness" IS NULL THEN NULL
    WHEN LOWER(COALESCE("source_type", '')) IN ('ai', 'ai_estimated', 'ai_vehicle_spec', 'ai_document') THEN 'AI_ESTIMATED'::"BrakeReferenceSpecEvidenceCategory"
    WHEN LOWER(COALESCE("source_type", '')) IN ('manufacturer', 'oem', 'manufacturer_confirmed') THEN 'MANUFACTURER_CONFIRMED'::"BrakeReferenceSpecEvidenceCategory"
    WHEN LOWER(COALESCE("source_type", '')) IN ('catalog', 'part_catalog', 'parts_catalog') THEN 'PART_CATALOG_CONFIRMED'::"BrakeReferenceSpecEvidenceCategory"
    WHEN LOWER(COALESCE("source_type", '')) IN ('default', 'default_assumption', 'registration_default') THEN 'DEFAULT_ASSUMPTION'::"BrakeReferenceSpecEvidenceCategory"
    WHEN LOWER(COALESCE("source_type", '')) IN ('manual', 'manual_registration', 'user', 'user_confirmed', 'document', 'documented', 'workshop') THEN 'USER_CONFIRMED'::"BrakeReferenceSpecEvidenceCategory"
    ELSE 'UNKNOWN'::"BrakeReferenceSpecEvidenceCategory"
  END,
  "rear_pad_evidence_category" = CASE
    WHEN "rear_pad_thickness" IS NULL THEN NULL
    WHEN LOWER(COALESCE("source_type", '')) IN ('ai', 'ai_estimated', 'ai_vehicle_spec', 'ai_document') THEN 'AI_ESTIMATED'::"BrakeReferenceSpecEvidenceCategory"
    WHEN LOWER(COALESCE("source_type", '')) IN ('manufacturer', 'oem', 'manufacturer_confirmed') THEN 'MANUFACTURER_CONFIRMED'::"BrakeReferenceSpecEvidenceCategory"
    WHEN LOWER(COALESCE("source_type", '')) IN ('catalog', 'part_catalog', 'parts_catalog') THEN 'PART_CATALOG_CONFIRMED'::"BrakeReferenceSpecEvidenceCategory"
    WHEN LOWER(COALESCE("source_type", '')) IN ('default', 'default_assumption', 'registration_default') THEN 'DEFAULT_ASSUMPTION'::"BrakeReferenceSpecEvidenceCategory"
    WHEN LOWER(COALESCE("source_type", '')) IN ('manual', 'manual_registration', 'user', 'user_confirmed', 'document', 'documented', 'workshop') THEN 'USER_CONFIRMED'::"BrakeReferenceSpecEvidenceCategory"
    ELSE 'UNKNOWN'::"BrakeReferenceSpecEvidenceCategory"
  END,
  "front_disc_evidence_category" = CASE
    WHEN "front_rotor_width" IS NOT NULL AND "front_disc_nominal_thickness_mm" IS NULL THEN 'LEGACY_UNVERIFIED'::"BrakeReferenceSpecEvidenceCategory"
    ELSE NULL
  END,
  "rear_disc_evidence_category" = CASE
    WHEN "rear_rotor_width" IS NOT NULL AND "rear_disc_nominal_thickness_mm" IS NULL THEN 'LEGACY_UNVERIFIED'::"BrakeReferenceSpecEvidenceCategory"
    ELSE NULL
  END,
  "semantic_mapping_version" = '2026-07-p10'
WHERE "semantic_mapping_version" IS NULL;
