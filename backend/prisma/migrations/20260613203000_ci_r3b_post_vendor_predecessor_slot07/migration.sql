-- CI-R3B historical predecessor repair slot 7
-- after: 20260613200000_booking_document_lifecycle
-- before: 20260613210000_vendor_management_overhaul

DO $$ BEGIN
    CREATE TYPE "VendorCategory" AS ENUM ('WORKSHOP', 'SERVICE_PARTNER', 'PAINT_SHOP', 'BODY_REPAIR', 'AUTO_GLASS', 'TIRE_DEALER', 'PARTS_DEALER', 'DETAILING', 'TUV_STATION', 'ONLINE_SUPPLIER', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "VendorSourceType" AS ENUM ('LOCAL_BUSINESS', 'ONLINE_VENDOR');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "vendor_vehicles" (
        "id" TEXT NOT NULL,
"vendor_id" TEXT NOT NULL,
"vehicle_id" TEXT NOT NULL,
"notes" TEXT,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vendor_vehicles_pkey" PRIMARY KEY ("id")
    );

CREATE TABLE IF NOT EXISTS "vendors" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"name" TEXT NOT NULL,
"category" "VendorCategory" NOT NULL DEFAULT 'WORKSHOP'::"VendorCategory",
"source_type" "VendorSourceType" NOT NULL DEFAULT 'LOCAL_BUSINESS'::"VendorSourceType",
"street" TEXT,
"city" TEXT,
"postal_code" TEXT,
"country" TEXT,
"latitude" DOUBLE PRECISION,
"longitude" DOUBLE PRECISION,
"website" TEXT,
"phone" TEXT,
"email" TEXT,
"notes" TEXT,
"contact_name" TEXT,
"contact_role" TEXT,
"contact_phone" TEXT,
"contact_email" TEXT,
"contact_notes" TEXT,
"is_active" BOOLEAN NOT NULL DEFAULT true,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendor_vehicles_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "vendor_vehicles"
            ADD CONSTRAINT "vendor_vehicles_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendor_vehicles_vendor_id_fkey'
    ) THEN
        ALTER TABLE "vendor_vehicles"
            ADD CONSTRAINT "vendor_vehicles_vendor_id_fkey"
            FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendors_organization_id_fkey'
    ) THEN
        ALTER TABLE "vendors"
            ADD CONSTRAINT "vendors_organization_id_fkey"
            FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_vehicles_vendor_id_vehicle_id_key" ON "vendor_vehicles"("vendor_id", "vehicle_id");

CREATE INDEX IF NOT EXISTS "vendor_vehicles_vehicle_id_idx" ON "vendor_vehicles"("vehicle_id");

CREATE INDEX IF NOT EXISTS "vendor_vehicles_vendor_id_idx" ON "vendor_vehicles"("vendor_id");

CREATE INDEX IF NOT EXISTS "vendors_category_idx" ON "vendors"("category");

CREATE INDEX IF NOT EXISTS "vendors_organization_id_idx" ON "vendors"("organization_id");
