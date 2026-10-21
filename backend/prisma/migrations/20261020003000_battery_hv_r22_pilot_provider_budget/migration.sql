-- HV R22-P1B durable pilot provider request budget (one attempt per pilot epoch + session).
CREATE TABLE "battery_hv_charging_counter_pilot_provider_requests" (
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "pilot_epoch" TEXT NOT NULL,
    "source_hv_charge_session_id" TEXT NOT NULL,
    "lifecycle_state" TEXT NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_started_at" TIMESTAMP(3),
    "terminal_at" TIMESTAMP(3),
    "outcome_detail" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "battery_hv_charging_counter_pilot_provider_requests_pkey" PRIMARY KEY (
        "organization_id",
        "vehicle_id",
        "pilot_epoch",
        "source_hv_charge_session_id"
    )
);

CREATE INDEX "battery_hv_cc_pilot_provider_req_vehicle_idx"
    ON "battery_hv_charging_counter_pilot_provider_requests"("organization_id", "vehicle_id");

ALTER TABLE "battery_hv_charging_counter_pilot_provider_requests"
    ADD CONSTRAINT "battery_hv_cc_pilot_provider_req_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charging_counter_pilot_provider_requests"
    ADD CONSTRAINT "battery_hv_cc_pilot_provider_req_vehicle_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
