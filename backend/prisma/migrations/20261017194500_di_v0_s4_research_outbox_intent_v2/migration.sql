-- EXP-021 S4 research: versioned outbox intents + run intent key (reprocessing).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE di_v0_s4_research_outbox_v1
  ADD COLUMN IF NOT EXISTS outbox_id TEXT,
  ADD COLUMN IF NOT EXISTS research_intent_key TEXT;

UPDATE di_v0_s4_research_outbox_v1
SET outbox_id = work_item_id,
    research_intent_key = research_bundle_version || ':legacy:' || work_item_id
WHERE outbox_id IS NULL OR research_intent_key IS NULL;

ALTER TABLE di_v0_s4_research_outbox_v1
  ALTER COLUMN outbox_id SET NOT NULL,
  ALTER COLUMN research_intent_key SET NOT NULL;

ALTER TABLE di_v0_s4_research_outbox_v1 DROP CONSTRAINT IF EXISTS di_v0_s4_research_outbox_v1_pkey;
ALTER TABLE di_v0_s4_research_outbox_v1 ADD PRIMARY KEY (outbox_id);

CREATE UNIQUE INDEX IF NOT EXISTS di_v0_s4_research_outbox_wi_intent_uq
  ON di_v0_s4_research_outbox_v1 (work_item_id, research_intent_key);

ALTER TABLE di_v0_s4_research_runs_v1
  ADD COLUMN IF NOT EXISTS research_intent_key TEXT;

CREATE INDEX IF NOT EXISTS di_v0_s4_research_runs_intent_idx
  ON di_v0_s4_research_runs_v1 (work_item_id, research_intent_key, research_status);
