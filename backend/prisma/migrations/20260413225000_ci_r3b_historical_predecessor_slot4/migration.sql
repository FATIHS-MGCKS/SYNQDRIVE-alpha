-- CI-R3B historical predecessor repair slot 4
-- after: 20260413220000_battery_evidence_unique_dedup
-- before: 20260413230000_add_composite_indexes_batch_c

DO $$ BEGIN
    CREATE TYPE "OrgInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "OrgInvoiceType" AS ENUM ('OUTGOING_BOOKING', 'OUTGOING_MANUAL', 'INCOMING_VENDOR', 'INCOMING_UPLOADED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE SEQUENCE IF NOT EXISTS "org_invoices_invoice_number_seq";

CREATE TABLE IF NOT EXISTS "org_invoices" (
        "id" TEXT NOT NULL,
"invoice_number" INTEGER NOT NULL DEFAULT nextval('org_invoices_invoice_number_seq'::regclass),
"organization_id" TEXT NOT NULL,
"type" "OrgInvoiceType" NOT NULL,
"customer_id" TEXT,
"vendor_name" TEXT,
"booking_id" TEXT,
"vehicle_id" TEXT,
"title" TEXT NOT NULL,
"description" TEXT,
"line_items" JSONB,
"subtotal_cents" INTEGER NOT NULL DEFAULT 0,
"tax_cents" INTEGER NOT NULL DEFAULT 0,
"total_cents" INTEGER NOT NULL,
"currency" TEXT NOT NULL DEFAULT 'EUR',
"invoice_date" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"due_date" TIMESTAMP(3) WITHOUT TIME ZONE,
"status" "OrgInvoiceStatus" NOT NULL DEFAULT 'DRAFT'::"OrgInvoiceStatus",
"template_id" TEXT,
"image_url" TEXT,
"extracted_data" JSONB,
"notes" TEXT,
"paid_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "org_invoices_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "org_invoices_organization_id_idx" ON "org_invoices"("organization_id");

CREATE INDEX IF NOT EXISTS "org_invoices_customer_id_idx" ON "org_invoices"("customer_id");

CREATE INDEX IF NOT EXISTS "org_invoices_booking_id_idx" ON "org_invoices"("booking_id");

CREATE INDEX IF NOT EXISTS "org_invoices_status_idx" ON "org_invoices"("status");

CREATE INDEX IF NOT EXISTS "org_invoices_type_idx" ON "org_invoices"("type");

CREATE INDEX IF NOT EXISTS "org_invoices_invoice_date_idx" ON "org_invoices"("invoice_date");

CREATE UNIQUE INDEX IF NOT EXISTS "org_invoices_invoice_number_key" ON "org_invoices"("invoice_number");

DO $$ BEGIN
    CREATE TYPE "DtcSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "vehicle_dtc_events" (
        "id" TEXT NOT NULL,
"vehicle_id" TEXT NOT NULL,
"dtc_code" TEXT NOT NULL,
"description" TEXT,
"severity" "DtcSeverity" NOT NULL DEFAULT 'WARNING'::"DtcSeverity",
"is_active" BOOLEAN NOT NULL DEFAULT TRUE,
"first_seen_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
"last_seen_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
"cleared_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"occurrence_count" INTEGER NOT NULL DEFAULT 1,
"raw_payload" JSONB,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vehicle_dtc_events_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_dtc_events_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "vehicle_dtc_events"
            ADD CONSTRAINT "vehicle_dtc_events_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "vehicle_dtc_events_vehicle_id_idx" ON "vehicle_dtc_events"("vehicle_id");

CREATE INDEX IF NOT EXISTS "vehicle_dtc_events_dtc_code_idx" ON "vehicle_dtc_events"("dtc_code");

CREATE INDEX IF NOT EXISTS "vehicle_dtc_events_is_active_idx" ON "vehicle_dtc_events"("is_active");

CREATE INDEX IF NOT EXISTS "vehicle_dtc_events_first_seen_at_idx" ON "vehicle_dtc_events"("first_seen_at");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'org_tasks_invoice_id_fkey'
    ) THEN
        ALTER TABLE "org_tasks"
            ADD CONSTRAINT "org_tasks_invoice_id_fkey"
            FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
