-- CreateTable
CREATE TABLE "rental_driving_analyses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "overall_level" TEXT NOT NULL,
    "driver_style_category" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "driving_score" DOUBLE PRECISION,
    "driving_events_count" INTEGER,
    "abuse_detection_count" INTEGER,
    "wear_impact" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_driving_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_driving_analyses_booking_id_key" ON "rental_driving_analyses"("booking_id");

-- CreateIndex
CREATE INDEX "rental_driving_analyses_organization_id_idx" ON "rental_driving_analyses"("organization_id");

-- CreateIndex
CREATE INDEX "rental_driving_analyses_vehicle_id_idx" ON "rental_driving_analyses"("vehicle_id");

-- CreateIndex
CREATE INDEX "rental_driving_analyses_driver_id_idx" ON "rental_driving_analyses"("driver_id");

-- CreateIndex
CREATE INDEX "rental_driving_analyses_period_start_period_end_idx" ON "rental_driving_analyses"("period_start", "period_end");

-- AddForeignKey
ALTER TABLE "rental_driving_analyses" ADD CONSTRAINT "rental_driving_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_driving_analyses" ADD CONSTRAINT "rental_driving_analyses_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_driving_analyses" ADD CONSTRAINT "rental_driving_analyses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_driving_analyses" ADD CONSTRAINT "rental_driving_analyses_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
