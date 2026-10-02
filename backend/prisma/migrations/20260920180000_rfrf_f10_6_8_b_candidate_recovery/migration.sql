-- F10.6.8-B — durable RawRefuelCandidate recovery scheduling (additive only)

CREATE TYPE "RawRefuelCandidateRecoveryLastOutcome" AS ENUM (
  'SUCCESS_CONVERGED',
  'SUCCESS_MATURED_READY',
  'PENDING_NATIVE_RECONCILIATION',
  'NO_MATCHING_OBSERVATION',
  'NO_NEW_EVIDENCE',
  'SAMPLE_FETCH_FAILED',
  'NO_DIMO_TOKEN',
  'CAPABILITY_NOT_SUPPORTED',
  'AMBIGUOUS_RECOVERY_OBSERVATION',
  'TERMINAL_NO_ACTION'
);

ALTER TABLE "raw_refuel_candidates"
  ADD COLUMN "recovery_next_attempt_at" TIMESTAMPTZ,
  ADD COLUMN "recovery_last_attempt_at" TIMESTAMPTZ,
  ADD COLUMN "recovery_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "recovery_last_outcome" "RawRefuelCandidateRecoveryLastOutcome",
  ADD COLUMN "recovery_lease_expires_at" TIMESTAMPTZ;

CREATE INDEX "raw_refuel_candidates_recovery_due_idx"
  ON "raw_refuel_candidates" ("lifecycle_state", "recovery_next_attempt_at");

UPDATE "raw_refuel_candidates"
SET "recovery_next_attempt_at" = COALESCE("last_observed_at", "created_at")
WHERE "lifecycle_state"::text IN ('INSUFFICIENT', 'OBSERVED', 'SETTLING', 'READY_FOR_PERSIST');
