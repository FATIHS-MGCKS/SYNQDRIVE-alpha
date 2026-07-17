-- Tire rental health review overrides (time-boxed manual release with audit trail)

CREATE TABLE "tire_rental_health_review_overrides" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "tire_setup_id" TEXT,
  "reason" TEXT NOT NULL,
  "granted_by_user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tire_rental_health_review_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tire_rental_health_review_overrides_organization_id_idx"
  ON "tire_rental_health_review_overrides"("organization_id");
CREATE INDEX "tire_rental_health_review_overrides_vehicle_id_idx"
  ON "tire_rental_health_review_overrides"("vehicle_id");
CREATE INDEX "tire_rental_health_review_overrides_expires_at_idx"
  ON "tire_rental_health_review_overrides"("expires_at");

ALTER TABLE "tire_rental_health_review_overrides"
  ADD CONSTRAINT "tire_rental_health_review_overrides_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tire_rental_health_review_overrides"
  ADD CONSTRAINT "tire_rental_health_review_overrides_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tire_rental_health_review_overrides"
  ADD CONSTRAINT "tire_rental_health_review_overrides_tire_setup_id_fkey"
  FOREIGN KEY ("tire_setup_id") REFERENCES "vehicle_tire_setups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tire_rental_health_review_overrides"
  ADD CONSTRAINT "tire_rental_health_review_overrides_granted_by_user_id_fkey"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
