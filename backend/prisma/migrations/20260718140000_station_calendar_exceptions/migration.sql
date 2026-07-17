-- Stations V2 Prompt 26: normalized calendar exceptions (holidays / special hours).

CREATE TYPE "station_calendar_exception_type" AS ENUM (
  'STATION_CLOSURE',
  'SPECIAL_OPENING',
  'MODIFIED_HOURS',
  'REGIONAL_HOLIDAY',
  'OPERATIONAL_EXCEPTION'
);

CREATE TYPE "station_calendar_recurrence_kind" AS ENUM ('NONE', 'YEARLY');

CREATE TYPE "station_calendar_exception_source" AS ENUM (
  'MANUAL',
  'LEGACY_HOLIDAY_RULES',
  'IMPORT'
);

CREATE TYPE "station_calendar_exception_status" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "station_calendar_exceptions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "station_id" TEXT NOT NULL,
  "type" "station_calendar_exception_type" NOT NULL,
  "status" "station_calendar_exception_status" NOT NULL DEFAULT 'ACTIVE',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "recurrence_kind" "station_calendar_recurrence_kind" NOT NULL DEFAULT 'NONE',
  "calendar_date" DATE,
  "month_day" TEXT,
  "closed_all_day" BOOLEAN NOT NULL DEFAULT false,
  "slots" JSONB,
  "region_code" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "source" "station_calendar_exception_source" NOT NULL DEFAULT 'MANUAL',
  "legacy_import_key" TEXT,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "cancelled_at" TIMESTAMP(3),
  "cancelled_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "station_calendar_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "station_calendar_exceptions_legacy_import_key_key"
  ON "station_calendar_exceptions"("legacy_import_key");

CREATE INDEX "station_calendar_exceptions_organization_id_station_id_status_idx"
  ON "station_calendar_exceptions"("organization_id", "station_id", "status");

CREATE INDEX "station_calendar_exceptions_station_id_calendar_date_idx"
  ON "station_calendar_exceptions"("station_id", "calendar_date");

ALTER TABLE "station_calendar_exceptions"
  ADD CONSTRAINT "station_calendar_exceptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "station_calendar_exceptions"
  ADD CONSTRAINT "station_calendar_exceptions_station_id_fkey"
  FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
