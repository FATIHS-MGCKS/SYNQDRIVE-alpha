-- Booking price snapshot revisions (Prompt 15): append-only revisions, invoice FK.

ALTER TABLE "booking_price_snapshots" DROP CONSTRAINT IF EXISTS "booking_price_snapshots_booking_id_key";

ALTER TABLE "booking_price_snapshots"
  ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "is_current" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "pricing_quote_id" TEXT,
  ADD COLUMN IF NOT EXISTS "calculated_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "engine_version" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata_json" JSONB;

UPDATE "booking_price_snapshots"
SET "calculated_at" = COALESCE("calculated_at", "created_at")
WHERE "calculated_at" IS NULL;

UPDATE "booking_price_snapshots"
SET "engine_version" = 'pricing-engine-v1'
WHERE "engine_version" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "booking_price_snapshots_booking_id_revision_key"
  ON "booking_price_snapshots" ("booking_id", "revision");

CREATE INDEX IF NOT EXISTS "booking_price_snapshots_org_booking_current_idx"
  ON "booking_price_snapshots" ("organization_id", "booking_id", "is_current");

ALTER TABLE "org_invoices"
  ADD COLUMN IF NOT EXISTS "booking_price_snapshot_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_invoices_booking_price_snapshot_id_idx"
  ON "org_invoices" ("booking_price_snapshot_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_invoices_booking_price_snapshot_id_fkey'
  ) THEN
    ALTER TABLE "org_invoices"
      ADD CONSTRAINT "org_invoices_booking_price_snapshot_id_fkey"
      FOREIGN KEY ("booking_price_snapshot_id")
      REFERENCES "booking_price_snapshots"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
