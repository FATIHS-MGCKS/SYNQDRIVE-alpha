-- M3.3F F4.1 — durable D1 source-evidence fence on D3 revisions (freshness authority).
ALTER TABLE "battery_longitudinal_profile_revisions"
  ADD COLUMN "source_evidence_fingerprint" CHAR(64);

CREATE INDEX "battery_longitudinal_profile_revisions_vehicle_source_fp_idx"
  ON "battery_longitudinal_profile_revisions" ("organization_id", "vehicle_id", "materialized_at" DESC);
