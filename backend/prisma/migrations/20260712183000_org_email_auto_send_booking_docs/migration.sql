-- V4.9.391 — Optional auto-send booking documents after confirmation (org setting).
ALTER TABLE "org_email_settings"
ADD COLUMN IF NOT EXISTS "auto_send_booking_documents_on_confirm" BOOLEAN NOT NULL DEFAULT false;
