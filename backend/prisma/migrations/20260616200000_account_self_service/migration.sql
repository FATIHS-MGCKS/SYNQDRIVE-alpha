-- Account self-service: per-user/org preferences and notification settings

CREATE TYPE "NotificationCategory" AS ENUM (
  'BOOKINGS',
  'PICKUPS_RETURNS',
  'TASKS',
  'INVOICES_PAYMENTS',
  'VEHICLE_HEALTH',
  'DAMAGE_MISUSE',
  'DOCUMENTS',
  'WEEKLY_REPORTS',
  'SECURITY'
);

CREATE TABLE "user_account_preferences" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "default_station_id" TEXT,
  "default_landing_page" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_account_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_notification_preferences" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "in_app" BOOLEAN NOT NULL DEFAULT true,
  "email" BOOLEAN NOT NULL DEFAULT true,
  "push" BOOLEAN NOT NULL DEFAULT false,
  "sms" BOOLEAN NOT NULL DEFAULT false,
  "critical_only" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_account_preferences_user_id_organization_id_key"
  ON "user_account_preferences"("user_id", "organization_id");

CREATE INDEX "user_account_preferences_organization_id_idx"
  ON "user_account_preferences"("organization_id");

CREATE UNIQUE INDEX "user_notification_preferences_user_id_organization_id_category_key"
  ON "user_notification_preferences"("user_id", "organization_id", "category");

CREATE INDEX "user_notification_preferences_user_id_organization_id_idx"
  ON "user_notification_preferences"("user_id", "organization_id");

ALTER TABLE "user_account_preferences"
  ADD CONSTRAINT "user_account_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_account_preferences"
  ADD CONSTRAINT "user_account_preferences_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_account_preferences"
  ADD CONSTRAINT "user_account_preferences_default_station_id_fkey"
  FOREIGN KEY ("default_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_notification_preferences"
  ADD CONSTRAINT "user_notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notification_preferences"
  ADD CONSTRAINT "user_notification_preferences_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
