-- Backfill vendor_id on org_invoices where a matching vendor name exists in the same org.
UPDATE org_invoices i
SET vendor_id = v.id
FROM vendors v
WHERE i.vendor_id IS NULL
  AND i.vendor_name IS NOT NULL
  AND trim(i.vendor_name) <> ''
  AND v.organization_id = i.organization_id
  AND lower(trim(v.name)) = lower(trim(i.vendor_name));
