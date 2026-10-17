-- P5-H1 hardening: recorded_at uses statement clock at insert (not transaction_start snapshot).
ALTER TABLE "vehicle_signal_capability_profile_revisions"
  ALTER COLUMN "recorded_at" SET DEFAULT clock_timestamp();
