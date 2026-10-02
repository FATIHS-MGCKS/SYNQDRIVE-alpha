-- M3.3D D3 — append-only longitudinal profile revision foundation (additive)

CREATE TABLE "battery_longitudinal_profile_revisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "longitudinal_profile_contract_version" TEXT NOT NULL,
  "profile_policy_version" TEXT NOT NULL,
  "canonical_profile_fingerprint" CHAR(64) NOT NULL,
  "scientific_profile_json" JSONB NOT NULL,
  "requested_session_limit" INTEGER NOT NULL,
  "applied_session_limit" INTEGER NOT NULL,
  "candidate_rest_session_count" INTEGER NOT NULL,
  "included_session_count" INTEGER NOT NULL,
  "provisional_session_count" INTEGER NOT NULL,
  "excluded_session_count" INTEGER NOT NULL,
  "first_included_anchor_at" TIMESTAMP(3),
  "last_included_anchor_at" TIMESTAMP(3),
  "profile_status" TEXT NOT NULL,
  "materialized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battery_longitudinal_profile_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "battery_lpr_fingerprint_hex_chk"
    CHECK ("canonical_profile_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "battery_longitudinal_profile_revision_scientific_identity"
  ON "battery_longitudinal_profile_revisions"(
    "organization_id",
    "vehicle_id",
    "longitudinal_profile_contract_version",
    "profile_policy_version",
    "canonical_profile_fingerprint"
  );

CREATE INDEX "battery_longitudinal_profile_revisions_vehicle_materialized_idx"
  ON "battery_longitudinal_profile_revisions"("vehicle_id", "materialized_at" DESC);

CREATE INDEX "battery_longitudinal_profile_revisions_org_created_idx"
  ON "battery_longitudinal_profile_revisions"("organization_id", "created_at" DESC);

ALTER TABLE "battery_longitudinal_profile_revisions"
  ADD CONSTRAINT "battery_longitudinal_profile_revisions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_longitudinal_profile_revisions"
  ADD CONSTRAINT "battery_longitudinal_profile_revisions_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
