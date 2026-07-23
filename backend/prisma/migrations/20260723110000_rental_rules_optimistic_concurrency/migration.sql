-- Rental rules optimistic concurrency (Prompt 21/34)
-- Adds monotonic version counters for organization defaults, categories, and vehicle overrides.

ALTER TABLE "organization_rental_rules"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "rental_vehicle_categories"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "vehicle_rental_requirement_overrides"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
