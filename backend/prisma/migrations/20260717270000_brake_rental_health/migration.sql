-- Brake rental health review overrides (temporary hard-block clearance with audit trail)

CREATE TABLE "brake_rental_health_review_overrides" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "granted_by_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brake_rental_health_review_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "brake_rental_health_review_overrides_organization_id_idx" ON "brake_rental_health_review_overrides"("organization_id");
CREATE INDEX "brake_rental_health_review_overrides_vehicle_id_idx" ON "brake_rental_health_review_overrides"("vehicle_id");
CREATE INDEX "brake_rental_health_review_overrides_expires_at_idx" ON "brake_rental_health_review_overrides"("expires_at");

ALTER TABLE "brake_rental_health_review_overrides" ADD CONSTRAINT "brake_rental_health_review_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brake_rental_health_review_overrides" ADD CONSTRAINT "brake_rental_health_review_overrides_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brake_rental_health_review_overrides" ADD CONSTRAINT "brake_rental_health_review_overrides_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
