-- Per-tire lifecycle timestamps (identity tracking for mount/dismount history).
ALTER TABLE "tires" ADD COLUMN IF NOT EXISTS "mounted_at" TIMESTAMP(3);
ALTER TABLE "tires" ADD COLUMN IF NOT EXISTS "dismounted_at" TIMESTAMP(3);
