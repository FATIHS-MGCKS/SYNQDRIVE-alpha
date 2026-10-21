-- EXP-021 Live Maturation Shadow PR-M2 — BullMQ job linkage on observation slots
ALTER TABLE "exp021_maturation_shadow_observation_slots"
ADD COLUMN IF NOT EXISTS "bull_job_id" TEXT;

CREATE INDEX IF NOT EXISTS "exp021_maturation_shadow_observation_slots_bull_job_id_idx"
ON "exp021_maturation_shadow_observation_slots"("bull_job_id");
