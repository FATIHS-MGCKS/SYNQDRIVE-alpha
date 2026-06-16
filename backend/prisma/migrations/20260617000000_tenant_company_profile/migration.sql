-- Tenant Company Profile: billing, branding, and invoice-generation fields on organizations

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "legal_company_name" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "legal_form" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tax_number" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "vat_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "is_small_business" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "default_vat_rate" DOUBLE PRECISION;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "invoice_prefix" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "next_invoice_number" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "payment_terms_days" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "invoice_email" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "bank_name" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "iban" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "bic" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pdf_footer_text" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "email_signature" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "accent_color" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "logo_dark_url" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "pdf_logo_url" TEXT;
