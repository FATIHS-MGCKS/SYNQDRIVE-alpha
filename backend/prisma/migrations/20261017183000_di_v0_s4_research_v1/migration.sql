-- EXP-021 S4 research road-matching V2 (post-S4 shadow; flags OFF by default).

CREATE TABLE di_v0_s4_research_osm_cache_v1 (
  osm_context_key TEXT PRIMARY KEY,
  osm_snapshot_sha256 TEXT NOT NULL,
  bbox_json JSONB NOT NULL,
  corridor_margin_m INT NOT NULL,
  overpass_gzip BYTEA NOT NULL,
  uncompressed_bytes INT NOT NULL,
  provider_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT di_v0_s4_research_osm_cache_provider_chk CHECK (
    provider_kind IN ('FILE_REGISTRY', 'OVERPASS_BOUNDED', 'TEST_FIXTURE')
  )
);

CREATE TABLE di_v0_s4_research_outbox_v1 (
  work_item_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  research_bundle_version TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_error_code TEXT NULL,
  last_error_at TIMESTAMPTZ NULL,
  claim_token TEXT NULL,
  claim_expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT di_v0_s4_research_outbox_status_chk CHECK (
    status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'SKIPPED_INELIGIBLE')
  )
);

CREATE INDEX di_v0_s4_research_outbox_claim_idx
  ON di_v0_s4_research_outbox_v1 (status, next_attempt_at, created_at);

CREATE TABLE di_v0_s4_research_runs_v1 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  research_bundle_version TEXT NOT NULL,
  geometry_projection_id TEXT NOT NULL,
  pinned_snapshot_hash TEXT NOT NULL,
  combined_input_identity TEXT NOT NULL,
  osm_context_key TEXT NULL,
  osm_snapshot_sha256 TEXT NULL,
  research_status TEXT NOT NULL,
  independent_road_id_accuracy TEXT NOT NULL DEFAULT 'NOT_ASSESSABLE',
  summary_json JSONB NOT NULL,
  windows_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT di_v0_s4_research_runs_status_chk CHECK (
    research_status IN ('SUCCEEDED', 'ROAD_CONTEXT_UNAVAILABLE', 'SNAPSHOT_INVALID', 'INELIGIBLE')
  ),
  CONSTRAINT di_v0_s4_research_runs_accuracy_chk CHECK (
    independent_road_id_accuracy = 'NOT_ASSESSABLE'
  )
);

CREATE UNIQUE INDEX di_v0_s4_research_runs_idempotency_uq
  ON di_v0_s4_research_runs_v1 (
    organization_id,
    trip_id,
    work_item_id,
    research_bundle_version,
    pinned_snapshot_hash,
    COALESCE(osm_context_key, 'NONE')
  );

CREATE INDEX di_v0_s4_research_runs_org_trip_idx
  ON di_v0_s4_research_runs_v1 (organization_id, trip_id);
