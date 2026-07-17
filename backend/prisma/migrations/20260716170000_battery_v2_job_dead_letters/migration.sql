-- Battery V2 job dead-letter ledger (Prompt 24/78)

CREATE TABLE IF NOT EXISTS "battery_v2_job_dead_letters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "correlation_id" TEXT,
    "error_code" TEXT NOT NULL,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL,
    "failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battery_v2_job_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "battery_v2_job_dead_letters_job_idempotency"
    ON "battery_v2_job_dead_letters"("job_type", "idempotency_key");

CREATE INDEX IF NOT EXISTS "battery_v2_job_dead_letters_organization_id_vehicle_id_idx"
    ON "battery_v2_job_dead_letters"("organization_id", "vehicle_id");

CREATE INDEX IF NOT EXISTS "battery_v2_job_dead_letters_failed_at_idx"
    ON "battery_v2_job_dead_letters"("failed_at" DESC);

DO $$ BEGIN
    ALTER TABLE "battery_v2_job_dead_letters"
        ADD CONSTRAINT "battery_v2_job_dead_letters_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "battery_v2_job_dead_letters"
        ADD CONSTRAINT "battery_v2_job_dead_letters_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
