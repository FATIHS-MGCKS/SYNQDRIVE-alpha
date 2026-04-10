-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RENTAL', 'FLEET', 'TAXI', 'LOGISTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('ORG_ADMIN', 'SUB_ADMIN', 'WORKER', 'DRIVER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserPlatformRole" AS ENUM ('MASTER_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductSlug" AS ENUM ('RENTAL', 'FLEET', 'TAXI');

-- CreateEnum
CREATE TYPE "OrgProductStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrgProductPlan" AS ENUM ('STARTER', 'BUSINESS', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'RENTED', 'IN_SERVICE', 'OUT_OF_SERVICE', 'RESERVED');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID', 'PLUGIN_HYBRID', 'OTHER');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SEDAN', 'SUV', 'HATCHBACK', 'WAGON', 'COUPE', 'CONVERTIBLE', 'VAN', 'TRUCK', 'MINIVAN', 'OTHER');

-- CreateEnum
CREATE TYPE "DimoConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'PENDING', 'ERROR');

-- CreateEnum
CREATE TYPE "BatterySourceType" AS ENUM ('DIMO', 'MANUAL', 'VIN_DECODE', 'ENRICHMENT');

-- CreateEnum
CREATE TYPE "TireSeason" AS ENUM ('SUMMER', 'WINTER', 'ALL_SEASON');

-- CreateEnum
CREATE TYPE "ServiceEventType" AS ENUM ('OIL_CHANGE', 'TIRE_ROTATION', 'BRAKE_SERVICE', 'BATTERY_REPLACEMENT', 'GENERAL_INSPECTION', 'REPAIR', 'OTHER');

-- CreateEnum
CREATE TYPE "EnrichmentJobType" AS ENUM ('BATTERY', 'BRAKE', 'TIRE', 'GENERAL');

-- CreateEnum
CREATE TYPE "EnrichmentJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('DIMO', 'STRIPE', 'WOOCOMMERCE', 'SHOPIFY');

-- CreateEnum
CREATE TYPE "IntegrationScope" AS ENUM ('PLATFORM', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIALING');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "ProspectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "DimoPollJobType" AS ENUM ('SNAPSHOT', 'LIVE_MAP', 'ANALYTICS', 'VEHICLE_SYNC');

-- CreateEnum
CREATE TYPE "DimoPollStatus" AS ENUM ('SUCCESS', 'FAILURE', 'TIMEOUT', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'CONNECT', 'DISCONNECT', 'REGISTER', 'IMPORT', 'CONVERT', 'SYNC', 'CANCEL');

-- CreateEnum
CREATE TYPE "ActivityEntity" AS ENUM ('ORGANIZATION', 'USER', 'VEHICLE', 'BOOKING', 'CUSTOMER', 'PROSPECT', 'INTEGRATION', 'SUBSCRIPTION', 'STATION', 'PRODUCT', 'DIMO_VEHICLE', 'SUPPORT_TICKET');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CleaningStatus" AS ENUM ('CLEAN', 'NEEDS_CLEANING');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('GOOD', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "business_type" "BusinessType" NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logo_url" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "auth_provider_id" TEXT,
    "platform_role" "UserPlatformRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "station_scope" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "StationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "slug" "ProductSlug" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_products" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "status" "OrgProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" "OrgProductPlan" NOT NULL DEFAULT 'STARTER',
    "activated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "station_id" TEXT,
    "dimo_vehicle_id" TEXT,
    "vin" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "vehicle_name" TEXT,
    "fuel_type" "FuelType" NOT NULL,
    "transmission" "TransmissionType",
    "vehicle_type" "VehicleType",
    "color" TEXT,
    "license_plate" TEXT,
    "mileage_km" INTEGER,
    "daily_rate_eur" DOUBLE PRECISION,
    "weekly_rate_eur" DOUBLE PRECISION,
    "monthly_rate_eur" DOUBLE PRECISION,
    "extra_km_price" DOUBLE PRECISION,
    "image_url" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "cleaning_status" "CleaningStatus" NOT NULL DEFAULT 'CLEAN',
    "health_status" "HealthStatus" NOT NULL DEFAULT 'GOOD',
    "notes" TEXT,
    "leasing_rate_cents" INTEGER,
    "insurance_cost_cents" INTEGER,
    "tax_cost_cents" INTEGER,
    "curb_weight_kg" DOUBLE PRECISION,
    "idle_rpm" INTEGER,
    "max_rpm" INTEGER,
    "service_interval_km" INTEGER,
    "service_interval_months" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dimo_vehicles" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "token_id" INTEGER,
    "vin" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "fuel_type" TEXT,
    "odometer_km" DOUBLE PRECISION,
    "last_signal" TIMESTAMP(3),
    "connection_status" "DimoConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "raw_json" JSONB,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dimo_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_battery_specs" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "battery_type" TEXT,
    "battery_ampere" DOUBLE PRECISION,
    "battery_volt" DOUBLE PRECISION,
    "source_type" "BatterySourceType" NOT NULL DEFAULT 'MANUAL',
    "source_confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_battery_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_tire_setups" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "front_dimension" TEXT,
    "rear_dimension" TEXT,
    "brand_model_front" TEXT,
    "brand_model_rear" TEXT,
    "tire_season" "TireSeason" NOT NULL DEFAULT 'ALL_SEASON',
    "installed_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_tire_setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_tire_tread_measurements" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "tire_setup_id" TEXT NOT NULL,
    "front_left_mm" DOUBLE PRECISION,
    "front_right_mm" DOUBLE PRECISION,
    "rear_left_mm" DOUBLE PRECISION,
    "rear_right_mm" DOUBLE PRECISION,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_tire_tread_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_brake_reference_specs" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "front_rotor_diameter" DOUBLE PRECISION,
    "front_rotor_width" DOUBLE PRECISION,
    "front_pad_thickness" DOUBLE PRECISION,
    "rear_rotor_diameter" DOUBLE PRECISION,
    "rear_rotor_width" DOUBLE PRECISION,
    "rear_pad_thickness" DOUBLE PRECISION,
    "source_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_brake_reference_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_service_events" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "event_type" "ServiceEventType" NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "odometer_km" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_service_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_enrichment_jobs" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "job_type" "EnrichmentJobType" NOT NULL,
    "status" "EnrichmentJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result_json" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_enrichment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_latest_states" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "dimo_token_id" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'dimo',
    "last_seen_at" TIMESTAMP(3),
    "online" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speed_kmh" DOUBLE PRECISION,
    "odometer_km" DOUBLE PRECISION,
    "oil_level_relative" DOUBLE PRECISION,
    "def_level" DOUBLE PRECISION,
    "range_km" DOUBLE PRECISION,
    "tire_pressure_fl" DOUBLE PRECISION,
    "tire_pressure_fr" DOUBLE PRECISION,
    "tire_pressure_rl" DOUBLE PRECISION,
    "tire_pressure_rr" DOUBLE PRECISION,
    "tire_health_percent" DOUBLE PRECISION,
    "ev_soc" DOUBLE PRECISION,
    "engine_load" DOUBLE PRECISION,
    "lv_battery_voltage" DOUBLE PRECISION,
    "fuel_level_relative" DOUBLE PRECISION,
    "fuel_level_absolute" DOUBLE PRECISION,
    "coolant_temp_c" DOUBLE PRECISION,
    "brake_pad_percent" DOUBLE PRECISION,
    "engine_oil_percent" DOUBLE PRECISION,
    "raw_payload_json" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_latest_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_position_updates" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'dimo',
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_position_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_cache" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "chart_type" TEXT NOT NULL,
    "range_from" TIMESTAMP(3) NOT NULL,
    "range_to" TIMESTAMP(3) NOT NULL,
    "interval" TEXT,
    "source" TEXT NOT NULL DEFAULT 'dimo',
    "cache_key" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dimo_poll_logs" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "job_type" "DimoPollJobType" NOT NULL,
    "status" "DimoPollStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "token_refreshed" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "error_code" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "meta_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dimo_poll_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "scope" "IntegrationScope" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config_schema" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_integrations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'INACTIVE',
    "credentials" JSONB,
    "config_json" JSONB,
    "last_sync_at" TIMESTAMP(3),
    "error_message" TEXT,
    "connected_at" TIMESTAMP(3),
    "disconnected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT,
    "stripe_customer_id" TEXT,
    "status" "BillingStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "stripe_invoice_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "invoice_pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospects" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "business_type" "BusinessType" NOT NULL,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "contact_name" TEXT,
    "city" TEXT,
    "country" TEXT,
    "fleet_size_estimate" INTEGER,
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "priority" "ProspectPriority" NOT NULL DEFAULT 'MEDIUM',
    "notes" TEXT,
    "last_contacted_at" TIMESTAMP(3),
    "converted_org_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "license_number" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "pickup_station_id" TEXT,
    "return_station_id" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "daily_rate_cents" INTEGER,
    "total_price_cents" INTEGER,
    "km_included" INTEGER,
    "km_driven" INTEGER,
    "insurance_options" JSONB,
    "extras_json" JSONB,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "user_id" TEXT,
    "action" "ActivityAction" NOT NULL,
    "entity" "ActivityEntity" NOT NULL,
    "entity_id" TEXT,
    "description" TEXT NOT NULL,
    "meta_json" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "reporter_email" TEXT NOT NULL,
    "reporter_name" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigned_to" TEXT,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_id_key" ON "users"("auth_provider_id");

-- CreateIndex
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships"("organization_id");

-- CreateIndex
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_user_id_organization_id_key" ON "organization_memberships"("user_id", "organization_id");

-- CreateIndex
CREATE INDEX "stations_organization_id_idx" ON "stations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "organization_products_organization_id_idx" ON "organization_products"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_products_organization_id_product_id_key" ON "organization_products"("organization_id", "product_id");

-- CreateIndex
CREATE INDEX "vehicles_organization_id_idx" ON "vehicles"("organization_id");

-- CreateIndex
CREATE INDEX "vehicles_station_id_idx" ON "vehicles"("station_id");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_organization_id_key" ON "vehicles"("vin", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "dimo_vehicles_external_id_key" ON "dimo_vehicles"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "dimo_vehicles_token_id_key" ON "dimo_vehicles"("token_id");

-- CreateIndex
CREATE INDEX "dimo_vehicles_vin_idx" ON "dimo_vehicles"("vin");

-- CreateIndex
CREATE INDEX "dimo_vehicles_connection_status_idx" ON "dimo_vehicles"("connection_status");

-- CreateIndex
CREATE INDEX "vehicle_battery_specs_vehicle_id_idx" ON "vehicle_battery_specs"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_tire_setups_vehicle_id_idx" ON "vehicle_tire_setups"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_tire_tread_measurements_vehicle_id_idx" ON "vehicle_tire_tread_measurements"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_tire_tread_measurements_tire_setup_id_idx" ON "vehicle_tire_tread_measurements"("tire_setup_id");

-- CreateIndex
CREATE INDEX "vehicle_brake_reference_specs_vehicle_id_idx" ON "vehicle_brake_reference_specs"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_service_events_vehicle_id_idx" ON "vehicle_service_events"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_service_events_event_date_idx" ON "vehicle_service_events"("event_date");

-- CreateIndex
CREATE INDEX "vehicle_enrichment_jobs_vehicle_id_idx" ON "vehicle_enrichment_jobs"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_enrichment_jobs_status_idx" ON "vehicle_enrichment_jobs"("status");

-- CreateIndex
CREATE INDEX "vehicle_enrichment_jobs_job_type_idx" ON "vehicle_enrichment_jobs"("job_type");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_latest_states_vehicle_id_key" ON "vehicle_latest_states"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_position_updates_vehicle_id_recorded_at_idx" ON "vehicle_position_updates"("vehicle_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_cache_cache_key_key" ON "analytics_cache"("cache_key");

-- CreateIndex
CREATE INDEX "analytics_cache_vehicle_id_idx" ON "analytics_cache"("vehicle_id");

-- CreateIndex
CREATE INDEX "analytics_cache_cache_key_idx" ON "analytics_cache"("cache_key");

-- CreateIndex
CREATE INDEX "analytics_cache_expires_at_idx" ON "analytics_cache"("expires_at");

-- CreateIndex
CREATE INDEX "dimo_poll_logs_vehicle_id_idx" ON "dimo_poll_logs"("vehicle_id");

-- CreateIndex
CREATE INDEX "dimo_poll_logs_job_type_idx" ON "dimo_poll_logs"("job_type");

-- CreateIndex
CREATE INDEX "dimo_poll_logs_created_at_idx" ON "dimo_poll_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_type_scope_key" ON "integrations"("type", "scope");

-- CreateIndex
CREATE INDEX "organization_integrations_organization_id_idx" ON "organization_integrations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_integrations_organization_id_integration_id_key" ON "organization_integrations"("organization_id", "integration_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_stripe_subscription_id_key" ON "billing_subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_organization_id_idx" ON "billing_subscriptions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_stripe_invoice_id_key" ON "billing_invoices"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "billing_invoices_subscription_id_idx" ON "billing_invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "prospects_status_idx" ON "prospects"("status");

-- CreateIndex
CREATE INDEX "prospects_priority_idx" ON "prospects"("priority");

-- CreateIndex
CREATE INDEX "prospects_business_type_idx" ON "prospects"("business_type");

-- CreateIndex
CREATE INDEX "customers_organization_id_idx" ON "customers"("organization_id");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "bookings_organization_id_idx" ON "bookings"("organization_id");

-- CreateIndex
CREATE INDEX "bookings_customer_id_idx" ON "bookings"("customer_id");

-- CreateIndex
CREATE INDEX "bookings_vehicle_id_idx" ON "bookings"("vehicle_id");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_start_date_end_date_idx" ON "bookings"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_idx" ON "activity_logs"("organization_id");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "activity_logs_entity_action_idx" ON "activity_logs"("entity", "action");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets"("priority");

-- CreateIndex
CREATE INDEX "support_tickets_organization_id_idx" ON "support_tickets"("organization_id");

-- CreateIndex
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets"("created_at");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_products" ADD CONSTRAINT "organization_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_products" ADD CONSTRAINT "organization_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_dimo_vehicle_id_fkey" FOREIGN KEY ("dimo_vehicle_id") REFERENCES "dimo_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_battery_specs" ADD CONSTRAINT "vehicle_battery_specs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_tire_setups" ADD CONSTRAINT "vehicle_tire_setups_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_tire_tread_measurements" ADD CONSTRAINT "vehicle_tire_tread_measurements_tire_setup_id_fkey" FOREIGN KEY ("tire_setup_id") REFERENCES "vehicle_tire_setups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_brake_reference_specs" ADD CONSTRAINT "vehicle_brake_reference_specs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_service_events" ADD CONSTRAINT "vehicle_service_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_enrichment_jobs" ADD CONSTRAINT "vehicle_enrichment_jobs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_latest_states" ADD CONSTRAINT "vehicle_latest_states_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_position_updates" ADD CONSTRAINT "vehicle_position_updates_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_cache" ADD CONSTRAINT "analytics_cache_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dimo_poll_logs" ADD CONSTRAINT "dimo_poll_logs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_integrations" ADD CONSTRAINT "organization_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_integrations" ADD CONSTRAINT "organization_integrations_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
