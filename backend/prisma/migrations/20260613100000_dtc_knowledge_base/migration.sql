-- DTC Knowledge Base — AI-enriched, reusable DTC explanations.
--
-- Two compact tables only (no separate job table by design). Queue/job state is
-- tracked via the `enrichment_status` columns. Stores only short summarized
-- knowledge — never raw web pages, HTML, long prompts, or full AI transcripts.
-- Idempotent (IF NOT EXISTS) so re-applying on a partially-migrated DB is safe.

-- 1) Generic per-code knowledge
CREATE TABLE IF NOT EXISTS "dtc_knowledge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "normalized_code" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'de',
    "system_category" TEXT,
    "standard_type" TEXT,
    "title" TEXT,
    "short_description" TEXT,
    "possible_causes" JSONB,
    "possible_effects" JSONB,
    "technical_urgency" TEXT,
    "rental_urgency" TEXT,
    "rental_recommendation" TEXT,
    "recommended_action" TEXT,
    "source_type" TEXT,
    "sources" JSONB,
    "enrichment_status" TEXT NOT NULL DEFAULT 'MISSING',
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMP(3),
    "last_enrichment_attempt_at" TIMESTAMP(3),
    "enrichment_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dtc_knowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dtc_knowledge_normalized_code_language_key" ON "dtc_knowledge"("normalized_code", "language");
CREATE INDEX IF NOT EXISTS "dtc_knowledge_normalized_code_idx" ON "dtc_knowledge"("normalized_code");
CREATE INDEX IF NOT EXISTS "dtc_knowledge_enrichment_status_idx" ON "dtc_knowledge"("enrichment_status");

-- 2) Vehicle-specific (make/model/year/fuel) knowledge
CREATE TABLE IF NOT EXISTS "dtc_vehicle_knowledge" (
    "id" TEXT NOT NULL,
    "dtc_knowledge_id" TEXT,
    "code" TEXT NOT NULL,
    "normalized_code" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'de',
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "fuel_type" TEXT,
    "engine_code" TEXT,
    "vehicle_specific_title" TEXT,
    "vehicle_specific_description" TEXT,
    "vehicle_specific_effects" JSONB,
    "vehicle_specific_urgency" TEXT,
    "vehicle_rental_recommendation" TEXT,
    "recommended_action" TEXT,
    "source_type" TEXT,
    "sources" JSONB,
    "enrichment_status" TEXT NOT NULL DEFAULT 'MISSING',
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "last_verified_at" TIMESTAMP(3),
    "last_enrichment_attempt_at" TIMESTAMP(3),
    "enrichment_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dtc_vehicle_knowledge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dtc_vehicle_knowledge_normalized_code_idx" ON "dtc_vehicle_knowledge"("normalized_code");
CREATE INDEX IF NOT EXISTS "dtc_vehicle_knowledge_normalized_code_make_model_year_idx" ON "dtc_vehicle_knowledge"("normalized_code", "make", "model", "year");
CREATE INDEX IF NOT EXISTS "dtc_vehicle_knowledge_enrichment_status_idx" ON "dtc_vehicle_knowledge"("enrichment_status");

-- FK: vehicle knowledge → generic knowledge (nullable, SET NULL on delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'dtc_vehicle_knowledge_dtc_knowledge_id_fkey'
    ) THEN
        ALTER TABLE "dtc_vehicle_knowledge"
            ADD CONSTRAINT "dtc_vehicle_knowledge_dtc_knowledge_id_fkey"
            FOREIGN KEY ("dtc_knowledge_id") REFERENCES "dtc_knowledge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
