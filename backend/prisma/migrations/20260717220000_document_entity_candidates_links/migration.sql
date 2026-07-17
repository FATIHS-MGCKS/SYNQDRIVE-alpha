-- Document Intake V2 P18: additive DocumentEntityCandidate + DocumentEntityLink.

CREATE TABLE "document_entity_candidates" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "extraction_id" TEXT NOT NULL,
  "entity_type" "DocumentEntityType" NOT NULL,
  "entity_id" TEXT,
  "confidence" DECIMAL(5, 4),
  "match_reasons" JSONB NOT NULL DEFAULT '[]',
  "conflicts" JSONB NOT NULL DEFAULT '[]',
  "rank" INTEGER NOT NULL,
  "status" "DocumentCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
  "resolver_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "document_entity_candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_entity_candidates_organization_id_extraction_id_idx"
  ON "document_entity_candidates" ("organization_id", "extraction_id");

CREATE INDEX "document_entity_candidates_extraction_id_entity_type_rank_idx"
  ON "document_entity_candidates" ("extraction_id", "entity_type", "rank");

CREATE INDEX "document_entity_candidates_extraction_id_status_idx"
  ON "document_entity_candidates" ("extraction_id", "status");

CREATE INDEX "document_entity_candidates_entity_type_entity_id_idx"
  ON "document_entity_candidates" ("entity_type", "entity_id");

CREATE TABLE "document_entity_links" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "extraction_id" TEXT NOT NULL,
  "entity_type" "DocumentEntityType" NOT NULL,
  "entity_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" "DocumentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "confirmed_by_user_id" TEXT,
  "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "superseded_at" TIMESTAMP(3),
  "source_candidate_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "document_entity_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_entity_links_organization_id_extraction_id_idx"
  ON "document_entity_links" ("organization_id", "extraction_id");

CREATE INDEX "document_entity_links_extraction_id_entity_type_superseded_at_idx"
  ON "document_entity_links" ("extraction_id", "entity_type", "superseded_at");

CREATE INDEX "document_entity_links_extraction_id_status_idx"
  ON "document_entity_links" ("extraction_id", "status");

CREATE INDEX "document_entity_links_entity_type_entity_id_idx"
  ON "document_entity_links" ("entity_type", "entity_id");

CREATE INDEX "document_entity_links_source_candidate_id_idx"
  ON "document_entity_links" ("source_candidate_id");

-- Exactly one active link per extraction + entity type.
CREATE UNIQUE INDEX "document_entity_links_extraction_entity_type_active_key"
  ON "document_entity_links" ("extraction_id", "entity_type")
  WHERE "superseded_at" IS NULL AND "status" = 'ACTIVE';

ALTER TABLE "document_entity_candidates"
  ADD CONSTRAINT "document_entity_candidates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_entity_candidates"
  ADD CONSTRAINT "document_entity_candidates_extraction_id_fkey"
  FOREIGN KEY ("extraction_id") REFERENCES "vehicle_document_extractions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_entity_links"
  ADD CONSTRAINT "document_entity_links_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_entity_links"
  ADD CONSTRAINT "document_entity_links_extraction_id_fkey"
  FOREIGN KEY ("extraction_id") REFERENCES "vehicle_document_extractions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_entity_links"
  ADD CONSTRAINT "document_entity_links_confirmed_by_user_id_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_entity_links"
  ADD CONSTRAINT "document_entity_links_source_candidate_id_fkey"
  FOREIGN KEY ("source_candidate_id") REFERENCES "document_entity_candidates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
