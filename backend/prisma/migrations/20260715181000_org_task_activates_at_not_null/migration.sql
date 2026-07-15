-- Backfill activatesAt for legacy rows, then enforce NOT NULL (spec §D).
UPDATE "org_tasks"
SET "activates_at" = "created_at"
WHERE "activates_at" IS NULL;

ALTER TABLE "org_tasks"
  ALTER COLUMN "activates_at" SET NOT NULL;
