-- Invoice list read-model query indexes (V4.9.465)
CREATE INDEX IF NOT EXISTS "org_invoices_organization_id_due_date_idx"
  ON "org_invoices" ("organization_id", "due_date");

CREATE INDEX IF NOT EXISTS "org_invoices_organization_id_type_status_idx"
  ON "org_invoices" ("organization_id", "type", "status");

CREATE INDEX IF NOT EXISTS "outbound_emails_organization_id_invoice_id_idx"
  ON "outbound_emails" ("organization_id", "invoice_id");
