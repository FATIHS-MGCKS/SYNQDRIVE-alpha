-- Legal document application scope (Prompt 7/32)
--
-- Adds explicit scope dimensions for resolver queries (Prompt 8).
-- Legacy German documents receive documented safe defaults without content changes.
-- Drops the legacy single-ACTIVE unique index — scope conflicts are detected at activation.

-- Enums
CREATE TYPE "LegalCustomerSegment" AS ENUM ('B2C', 'B2B', 'BOTH');
CREATE TYPE "LegalBookingChannel" AS ENUM ('MANUAL', 'WEBSITE', 'API', 'OPERATOR_APP', 'ALL');
CREATE TYPE "LegalStationScopeMode" AS ENUM ('ORGANIZATION_WIDE', 'STATION_SPECIFIC');
CREATE TYPE "LegalNoticePurpose" AS ENUM (
  'TERMS_AND_CONDITIONS',
  'PRIVACY_POLICY',
  'WITHDRAWAL_RIGHT_NOTICE',
  'NO_WITHDRAWAL_RIGHT_NOTICE',
  'OTHER_CONSUMER_INFORMATION',
  'GENERAL_NOTICE'
);

-- Scope columns with safe defaults (existing rows remain valid)
ALTER TABLE "organization_legal_documents"
  ADD COLUMN IF NOT EXISTS "jurisdiction_country" TEXT NOT NULL DEFAULT 'DE',
  ADD COLUMN IF NOT EXISTS "customer_segment" "LegalCustomerSegment" NOT NULL DEFAULT 'BOTH',
  ADD COLUMN IF NOT EXISTS "booking_channel" "LegalBookingChannel" NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "product_scope" "BusinessType",
  ADD COLUMN IF NOT EXISTS "station_scope_mode" "LegalStationScopeMode" NOT NULL DEFAULT 'ORGANIZATION_WIDE',
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notice_purpose" "LegalNoticePurpose" NOT NULL DEFAULT 'GENERAL_NOTICE';

-- Derive jurisdiction from language for existing rows (de→DE, at→AT, ch→CH)
UPDATE "organization_legal_documents"
SET "jurisdiction_country" = CASE
  WHEN lower("language") IN ('at', 'de-at') THEN 'AT'
  WHEN lower("language") IN ('ch', 'de-ch') THEN 'CH'
  ELSE 'DE'
END
WHERE "jurisdiction_country" = 'DE';

-- Derive notice purpose from document type / variant
UPDATE "organization_legal_documents"
SET "notice_purpose" = CASE
  WHEN "document_type" = 'TERMS_AND_CONDITIONS' THEN 'TERMS_AND_CONDITIONS'::"LegalNoticePurpose"
  WHEN "document_type" = 'PRIVACY_POLICY' THEN 'PRIVACY_POLICY'::"LegalNoticePurpose"
  WHEN "legal_variant" = 'WITHDRAWAL_RIGHT_NOTICE' THEN 'WITHDRAWAL_RIGHT_NOTICE'::"LegalNoticePurpose"
  WHEN "legal_variant" = 'NO_WITHDRAWAL_RIGHT_NOTICE' THEN 'NO_WITHDRAWAL_RIGHT_NOTICE'::"LegalNoticePurpose"
  WHEN "document_type" = 'CONSUMER_INFORMATION' THEN 'OTHER_CONSUMER_INFORMATION'::"LegalNoticePurpose"
  ELSE 'GENERAL_NOTICE'::"LegalNoticePurpose"
END;

-- Station scope junction (normalized — no JSON station lists)
CREATE TABLE IF NOT EXISTS "organization_legal_document_stations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "legal_document_id" TEXT NOT NULL,
  "station_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_legal_document_stations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_legal_document_stations_doc_station_key"
  ON "organization_legal_document_stations" ("legal_document_id", "station_id");

CREATE INDEX IF NOT EXISTS "organization_legal_document_stations_org_station_idx"
  ON "organization_legal_document_stations" ("organization_id", "station_id");

CREATE INDEX IF NOT EXISTS "organization_legal_document_stations_doc_idx"
  ON "organization_legal_document_stations" ("legal_document_id");

ALTER TABLE "organization_legal_document_stations"
  ADD CONSTRAINT "organization_legal_document_stations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_legal_document_stations"
  ADD CONSTRAINT "organization_legal_document_stations_legal_document_id_fkey"
  FOREIGN KEY ("legal_document_id") REFERENCES "organization_legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_legal_document_stations"
  ADD CONSTRAINT "organization_legal_document_stations_station_id_fkey"
  FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Event scope snapshots
ALTER TABLE "organization_legal_document_events"
  ADD COLUMN IF NOT EXISTS "customer_segment" TEXT,
  ADD COLUMN IF NOT EXISTS "booking_channel" TEXT,
  ADD COLUMN IF NOT EXISTS "product_scope" TEXT,
  ADD COLUMN IF NOT EXISTS "station_scope_mode" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_mandatory" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "notice_purpose" TEXT;

UPDATE "organization_legal_document_events" e
SET
  "jurisdiction" = COALESCE(
    e."jurisdiction",
    CASE
      WHEN lower(d."language") IN ('at', 'de-at') THEN 'AT'
      WHEN lower(d."language") IN ('ch', 'de-ch') THEN 'CH'
      ELSE 'DE'
    END
  ),
  "customer_segment" = d."customer_segment"::text,
  "booking_channel" = d."booking_channel"::text,
  "product_scope" = d."product_scope"::text,
  "station_scope_mode" = d."station_scope_mode"::text,
  "priority" = d."priority",
  "is_mandatory" = d."is_mandatory",
  "notice_purpose" = d."notice_purpose"::text
FROM "organization_legal_documents" d
WHERE e."legal_document_id" = d.id
  AND e."customer_segment" IS NULL;

-- Resolver query index
CREATE INDEX IF NOT EXISTS "organization_legal_documents_resolver_scope_idx"
  ON "organization_legal_documents" (
    "organization_id",
    "status",
    "document_type",
    "language",
    "jurisdiction_country",
    "customer_segment",
    "booking_channel"
  );

-- Drop legacy single-ACTIVE index — multiple scoped ACTIVE rules are allowed (Prompt 7)
DROP INDEX IF EXISTS "organization_legal_documents_single_active_key";
