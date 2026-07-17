-- Prompt 20: revision-safe brake evidence lifecycle, dedupe, unified sources

CREATE TYPE "BrakeEvidenceFreshnessStatus" AS ENUM ('FRESH', 'STALE', 'EXPIRED', 'UNKNOWN');
CREATE TYPE "BrakeEvidenceConfirmationStatus" AS ENUM ('UNCONFIRMED', 'CONFIRMED', 'NOT_APPLICABLE');

CREATE TYPE "BrakeEvidenceSource_new" AS ENUM (
  'MANUAL_MEASUREMENT',
  'WORKSHOP_MEASUREMENT',
  'DOCUMENTED_REPLACEMENT',
  'INSPECTION_PROTOCOL',
  'AI_UPLOAD_UNCONFIRMED',
  'AI_UPLOAD_CONFIRMED',
  'DTC_SIGNAL',
  'PROVIDER_WARNING',
  'BRAKE_WEAR_SENSOR',
  'TELEMATICS_ESTIMATION'
);

ALTER TABLE brake_evidence
  ALTER COLUMN source TYPE "BrakeEvidenceSource_new"
  USING (
    CASE source::text
      WHEN 'WORKSHOP_REPORT' THEN 'WORKSHOP_MEASUREMENT'
      WHEN 'SERVICE_INVOICE' THEN 'DOCUMENTED_REPLACEMENT'
      WHEN 'AI_UPLOAD' THEN 'AI_UPLOAD_CONFIRMED'
      ELSE source::text
    END::"BrakeEvidenceSource_new"
  );

DROP TYPE "BrakeEvidenceSource";
ALTER TYPE "BrakeEvidenceSource_new" RENAME TO "BrakeEvidenceSource";

ALTER TABLE brake_evidence
  ADD COLUMN IF NOT EXISTS organization_id TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS freshness_status "BrakeEvidenceFreshnessStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS confirmation_status "BrakeEvidenceConfirmationStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_evidence_id UUID,
  ADD COLUMN IF NOT EXISTS external_source_id TEXT,
  ADD COLUMN IF NOT EXISTS recalculation_enqueued_at TIMESTAMPTZ;

UPDATE brake_evidence
SET
  first_observed_at = COALESCE(measured_at, created_at),
  last_observed_at = COALESCE(measured_at, created_at),
  resolved_at = dtc_resolved_at,
  active = COALESCE(dtc_active, true),
  freshness_status = CASE
    WHEN dtc_freshness::text = 'FRESH' THEN 'FRESH'::"BrakeEvidenceFreshnessStatus"
    WHEN dtc_freshness::text = 'STALE' THEN 'STALE'::"BrakeEvidenceFreshnessStatus"
    ELSE 'UNKNOWN'::"BrakeEvidenceFreshnessStatus"
  END,
  confirmation_status = CASE
    WHEN source::text IN ('AI_UPLOAD_CONFIRMED', 'MANUAL_MEASUREMENT', 'WORKSHOP_MEASUREMENT', 'INSPECTION_PROTOCOL', 'DOCUMENTED_REPLACEMENT')
      THEN 'CONFIRMED'::"BrakeEvidenceConfirmationStatus"
    WHEN source::text = 'AI_UPLOAD_UNCONFIRMED' THEN 'UNCONFIRMED'::"BrakeEvidenceConfirmationStatus"
    ELSE 'NOT_APPLICABLE'::"BrakeEvidenceConfirmationStatus"
  END
WHERE first_observed_at IS NULL;

UPDATE brake_evidence be
SET organization_id = v.organization_id
FROM vehicles v
WHERE be.vehicle_id = v.id
  AND be.organization_id IS NULL;

ALTER TABLE brake_evidence
  ADD CONSTRAINT brake_evidence_superseded_by_fkey
  FOREIGN KEY (superseded_by_evidence_id) REFERENCES brake_evidence(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS brake_evidence_vehicle_dedupe_key_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS brake_evidence_org_vehicle_dedupe_uniq
  ON brake_evidence (organization_id, vehicle_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND active = true
    AND superseded_by_evidence_id IS NULL;

CREATE INDEX IF NOT EXISTS brake_evidence_vehicle_active_idx
  ON brake_evidence (vehicle_id, active, last_observed_at DESC);

CREATE INDEX IF NOT EXISTS brake_evidence_vehicle_superseded_idx
  ON brake_evidence (superseded_by_evidence_id)
  WHERE superseded_by_evidence_id IS NOT NULL;
