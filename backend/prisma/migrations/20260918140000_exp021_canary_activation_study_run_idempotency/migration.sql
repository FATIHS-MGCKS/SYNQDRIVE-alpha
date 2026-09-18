-- EXP-021 canary live window — durable StudyRun idempotency per vehicle trip.

ALTER TABLE "exp021_study_runs"
  ADD COLUMN "canary_activation_vehicle_trip_id" TEXT;

CREATE UNIQUE INDEX "exp021_study_runs_canary_activation_vehicle_trip_id_key"
  ON "exp021_study_runs"("canary_activation_vehicle_trip_id")
  WHERE "canary_activation_vehicle_trip_id" IS NOT NULL;
