-- Neutral OSM-miss rows must not block later SUCCEEDED runs for the same research intent.

DROP INDEX IF EXISTS di_v0_s4_research_runs_idempotency_uq;

CREATE UNIQUE INDEX di_v0_s4_research_runs_succeeded_intent_uq
  ON di_v0_s4_research_runs_v1 (work_item_id, research_intent_key)
  WHERE research_status = 'SUCCEEDED';

CREATE UNIQUE INDEX di_v0_s4_research_runs_exact_idempotency_uq
  ON di_v0_s4_research_runs_v1 (
    work_item_id,
    research_intent_key,
    research_status,
    COALESCE(osm_context_key, 'NONE'),
    COALESCE(osm_snapshot_sha256, 'NONE')
  );
