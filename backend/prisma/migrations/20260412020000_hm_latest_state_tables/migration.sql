-- CreateTable: per-VIN latest normalized health state (HM Health-APP MQTT consumer)
CREATE TABLE "hm_latest_health_states" (
    "id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "app_container_type" "HmAppContainerType" NOT NULL DEFAULT 'HM_HEALTH_APP',
    "hm_vehicle_id" TEXT,
    "last_message_id" TEXT,
    "last_received_at" TIMESTAMP(3) NOT NULL,
    "dashboard_lights_json" JSONB,
    "brake_lining_pre_warning" BOOLEAN,
    "engine_limp_mode" BOOLEAN,
    "engine_oil_level_json" JSONB,
    "distance_to_next_service_km" DOUBLE PRECISION,
    "time_to_next_service_days" INTEGER,
    "tire_pressure_statuses_json" JSONB,
    "tire_pressures_json" JSONB,
    "raw_signals_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hm_latest_health_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable: per-VIN latest normalized telemetry state (HM Telemetry-APP MQTT consumer)
CREATE TABLE "hm_latest_telemetry_states" (
    "id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "app_container_type" "HmAppContainerType" NOT NULL DEFAULT 'HM_TELEMETRY_APP',
    "hm_vehicle_id" TEXT,
    "last_message_id" TEXT,
    "last_received_at" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speed_kmh" DOUBLE PRECISION,
    "ignition_on" BOOLEAN,
    "odometer_km" DOUBLE PRECISION,
    "fuel_level_percent" DOUBLE PRECISION,
    "battery_voltage" DOUBLE PRECISION,
    "raw_signals_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hm_latest_telemetry_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hm_latest_health_states_vin_idx" ON "hm_latest_health_states"("vin");

-- CreateIndex
CREATE INDEX "hm_latest_health_states_app_container_type_idx" ON "hm_latest_health_states"("app_container_type");

-- CreateIndex
CREATE UNIQUE INDEX "hm_latest_health_states_vin_app_container_type_key" ON "hm_latest_health_states"("vin", "app_container_type");

-- CreateIndex
CREATE INDEX "hm_latest_telemetry_states_vin_idx" ON "hm_latest_telemetry_states"("vin");

-- CreateIndex
CREATE INDEX "hm_latest_telemetry_states_app_container_type_idx" ON "hm_latest_telemetry_states"("app_container_type");

-- CreateIndex
CREATE UNIQUE INDEX "hm_latest_telemetry_states_vin_app_container_type_key" ON "hm_latest_telemetry_states"("vin", "app_container_type");
