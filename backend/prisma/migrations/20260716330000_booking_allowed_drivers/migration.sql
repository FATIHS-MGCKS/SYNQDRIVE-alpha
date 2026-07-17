-- P56: multiple allowed drivers per booking (primary + additional)
CREATE TYPE "BookingDriverRole" AS ENUM ('PRIMARY', 'ADDITIONAL');

CREATE TABLE "booking_allowed_drivers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "role" "BookingDriverRole" NOT NULL DEFAULT 'ADDITIONAL',
    "added_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_allowed_drivers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_allowed_drivers_booking_id_customer_id_key" ON "booking_allowed_drivers"("booking_id", "customer_id");
CREATE INDEX "booking_allowed_drivers_organization_id_idx" ON "booking_allowed_drivers"("organization_id");
CREATE INDEX "booking_allowed_drivers_booking_id_idx" ON "booking_allowed_drivers"("booking_id");
CREATE INDEX "booking_allowed_drivers_customer_id_idx" ON "booking_allowed_drivers"("customer_id");
CREATE INDEX "booking_allowed_drivers_booking_id_role_idx" ON "booking_allowed_drivers"("booking_id", "role");

ALTER TABLE "booking_allowed_drivers" ADD CONSTRAINT "booking_allowed_drivers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_allowed_drivers" ADD CONSTRAINT "booking_allowed_drivers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_allowed_drivers" ADD CONSTRAINT "booking_allowed_drivers_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_allowed_drivers" ADD CONSTRAINT "booking_allowed_drivers_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
