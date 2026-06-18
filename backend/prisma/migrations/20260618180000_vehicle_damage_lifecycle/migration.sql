-- Vehicle damage lifecycle & map placement foundation (V4.8.98)

CREATE TYPE "DamageStatus" AS ENUM ('OPEN', 'IN_REPAIR', 'REPAIRED', 'ARCHIVED');
CREATE TYPE "DamageLocationView" AS ENUM ('FRONT', 'LEFT', 'RIGHT', 'REAR', 'ROOF', 'UNKNOWN');
CREATE TYPE "DamageSource" AS ENUM ('MANUAL', 'PICKUP_HANDOVER', 'RETURN_HANDOVER', 'AI_UPLOAD', 'WORKSHOP', 'INSPECTION');
CREATE TYPE "DamageRentalImpact" AS ENUM ('NONE', 'WATCH', 'BLOCK_RENTAL', 'SAFETY_CRITICAL');
CREATE TYPE "DamageEvidenceStatus" AS ENUM ('MISSING', 'PARTIAL', 'COMPLETE', 'DISPUTED');

ALTER TABLE "vehicle_damages" ADD COLUMN "status" "DamageStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "vehicle_damages" ADD COLUMN "location_view" "DamageLocationView" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "vehicle_damages" ADD COLUMN "source" "DamageSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "vehicle_damages" ADD COLUMN "rental_impact" "DamageRentalImpact" NOT NULL DEFAULT 'NONE';
ALTER TABLE "vehicle_damages" ADD COLUMN "evidence_status" "DamageEvidenceStatus" NOT NULL DEFAULT 'MISSING';
ALTER TABLE "vehicle_damages" ADD COLUMN "repair_cost_cents" INTEGER;
ALTER TABLE "vehicle_damages" ADD COLUMN "charged_to_customer_cents" INTEGER;
ALTER TABLE "vehicle_damages" ADD COLUMN "deposit_hold_cents" INTEGER;
ALTER TABLE "vehicle_damages" ADD COLUMN "booking_id" TEXT;
ALTER TABLE "vehicle_damages" ADD COLUMN "customer_id" TEXT;
ALTER TABLE "vehicle_damages" ADD COLUMN "handover_protocol_id" TEXT;
ALTER TABLE "vehicle_damages" ADD COLUMN "task_id" TEXT;
ALTER TABLE "vehicle_damages" ADD COLUMN "repair_started_at" TIMESTAMP(3);

ALTER TABLE "vehicle_damage_images" ADD COLUMN "mime_type" TEXT;
ALTER TABLE "vehicle_damage_images" ADD COLUMN "uploaded_by" TEXT;

-- Backfill status from repaired_at / repair_started_at
UPDATE "vehicle_damages"
SET "status" = 'REPAIRED'
WHERE "repaired_at" IS NOT NULL;

UPDATE "vehicle_damages"
SET "status" = 'IN_REPAIR'
WHERE "repaired_at" IS NULL AND "repair_started_at" IS NOT NULL;

-- Backfill rental_impact from severity (migration-safe defaults)
UPDATE "vehicle_damages"
SET "rental_impact" = CASE
  WHEN "severity" = 'MINOR' THEN 'NONE'::"DamageRentalImpact"
  WHEN "severity" = 'MODERATE' THEN 'WATCH'::"DamageRentalImpact"
  WHEN "severity" = 'MAJOR' THEN 'BLOCK_RENTAL'::"DamageRentalImpact"
  WHEN "severity" = 'CRITICAL' THEN 'SAFETY_CRITICAL'::"DamageRentalImpact"
  ELSE 'NONE'::"DamageRentalImpact"
END;

-- Backfill evidence_status from image counts (skip DISPUTED — none yet)
UPDATE "vehicle_damages" d
SET "evidence_status" = CASE
  WHEN img.cnt = 0 THEN 'MISSING'::"DamageEvidenceStatus"
  WHEN img.cnt = 1 THEN 'PARTIAL'::"DamageEvidenceStatus"
  ELSE 'COMPLETE'::"DamageEvidenceStatus"
END
FROM (
  SELECT "damage_id", COUNT(*)::int AS cnt
  FROM "vehicle_damage_images"
  GROUP BY "damage_id"
) img
WHERE d.id = img.damage_id;

CREATE INDEX "vehicle_damages_status_idx" ON "vehicle_damages"("status");
CREATE INDEX "vehicle_damages_booking_id_idx" ON "vehicle_damages"("booking_id");
CREATE INDEX "vehicle_damages_customer_id_idx" ON "vehicle_damages"("customer_id");
CREATE INDEX "vehicle_damages_handover_protocol_id_idx" ON "vehicle_damages"("handover_protocol_id");
CREATE INDEX "vehicle_damages_task_id_idx" ON "vehicle_damages"("task_id");

ALTER TABLE "vehicle_damages" ADD CONSTRAINT "vehicle_damages_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_damages" ADD CONSTRAINT "vehicle_damages_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_damages" ADD CONSTRAINT "vehicle_damages_handover_protocol_id_fkey"
  FOREIGN KEY ("handover_protocol_id") REFERENCES "booking_handover_protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_damages" ADD CONSTRAINT "vehicle_damages_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "org_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
