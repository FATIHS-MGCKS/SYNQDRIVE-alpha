-- Corrective: store T0 as absolute timestamptz (session-TZ independent reads/writes).
-- Existing rows: interpret prior TIMESTAMP(3) values as UTC wall-clock instants.

ALTER TABLE "apd_shadow_activation_epochs"
  ALTER COLUMN "activated_at" TYPE TIMESTAMPTZ(3)
  USING CASE
    WHEN "activated_at" IS NULL THEN NULL
    ELSE "activated_at" AT TIME ZONE 'UTC'
  END;
