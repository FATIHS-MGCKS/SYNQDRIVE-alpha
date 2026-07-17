-- P53: separate booking customer from driver roles

ALTER TABLE "bookings" ADD COLUMN "assigned_driver_id" TEXT;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_assigned_driver_id_fkey"
  FOREIGN KEY ("assigned_driver_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "bookings_assigned_driver_id_idx" ON "bookings"("assigned_driver_id");

ALTER TABLE "vehicle_trips" ADD COLUMN "booking_customer_id" TEXT;
ALTER TABLE "vehicle_trips" ADD COLUMN "assigned_driver_id" TEXT;
ALTER TABLE "vehicle_trips" ADD COLUMN "actual_driver_id" TEXT;

ALTER TABLE "rental_driving_analyses" ADD COLUMN "booking_customer_id" TEXT;
ALTER TABLE "rental_driving_analyses" ADD COLUMN "assigned_driver_id" TEXT;
ALTER TABLE "rental_driving_analyses" ADD COLUMN "actual_driver_id" TEXT;

UPDATE "rental_driving_analyses"
SET "booking_customer_id" = "driver_id"
WHERE "booking_customer_id" IS NULL;

ALTER TABLE "rental_driving_analyses"
  ALTER COLUMN "booking_customer_id" SET NOT NULL;

ALTER TABLE "rental_driving_analyses" ALTER COLUMN "driver_id" DROP NOT NULL;

ALTER TABLE "misuse_cases" ADD COLUMN "assigned_driver_id" TEXT;
ALTER TABLE "misuse_cases" ADD COLUMN "actual_driver_id" TEXT;

ALTER TABLE "rental_driving_analyses"
  ADD CONSTRAINT "rental_driving_analyses_booking_customer_id_fkey"
  FOREIGN KEY ("booking_customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rental_driving_analyses"
  ADD CONSTRAINT "rental_driving_analyses_assigned_driver_id_fkey"
  FOREIGN KEY ("assigned_driver_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rental_driving_analyses"
  ADD CONSTRAINT "rental_driving_analyses_actual_driver_id_fkey"
  FOREIGN KEY ("actual_driver_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "misuse_cases"
  ADD CONSTRAINT "misuse_cases_assigned_driver_id_fkey"
  FOREIGN KEY ("assigned_driver_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "misuse_cases"
  ADD CONSTRAINT "misuse_cases_actual_driver_id_fkey"
  FOREIGN KEY ("actual_driver_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "rental_driving_analyses_booking_customer_id_idx" ON "rental_driving_analyses"("booking_customer_id");
CREATE INDEX "misuse_cases_assigned_driver_id_idx" ON "misuse_cases"("assigned_driver_id");
CREATE INDEX "misuse_cases_actual_driver_id_idx" ON "misuse_cases"("actual_driver_id");
