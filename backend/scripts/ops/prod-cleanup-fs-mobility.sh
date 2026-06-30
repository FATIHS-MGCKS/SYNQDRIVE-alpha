#!/usr/bin/env bash
set -euo pipefail

export DATABASE_URL="$(grep '^DATABASE_URL=' /opt/synqdrive/shared/backend.env | cut -d= -f2- | sed 's/?.*$//')"
ORG_ID='faa710c9-6d91-4079-a7d5-91fdccdec14a'
MERCEDES_VEHICLE_ID='a60c0749-a7cd-494e-b5b9-dea3c6b97d63'
KEEP_TASK_DEDUP_KEY="service_overdue:${MERCEDES_VEHICLE_ID}"

KEEP_TASK_ID="$(psql "$DATABASE_URL" -t -A -c "SELECT id FROM org_tasks WHERE organization_id='${ORG_ID}' AND dedup_key='${KEEP_TASK_DEDUP_KEY}' LIMIT 1;")"
if [[ -z "${KEEP_TASK_ID}" ]]; then
  echo "ERROR: Mercedes service-overdue task not found (dedup_key=${KEEP_TASK_DEDUP_KEY})" >&2
  exit 1
fi
echo "Keeping task ${KEEP_TASK_ID} (${KEEP_TASK_DEDUP_KEY})"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;

-- Keep only Mercedes service-overdue task
DELETE FROM org_tasks
WHERE organization_id = '${ORG_ID}'
  AND id <> '${KEEP_TASK_ID}';

-- Remove all org invoices (+ payments cascade)
DELETE FROM org_invoices
WHERE organization_id = '${ORG_ID}';

-- Invoice-related generated documents / sequences
DELETE FROM generated_documents
WHERE organization_id = '${ORG_ID}';

DELETE FROM org_invoice_sequences
WHERE organization_id = '${ORG_ID}';

UPDATE organizations
SET next_invoice_number = 1
WHERE id = '${ORG_ID}';

-- Booking/customer satellite data
DELETE FROM booking_document_bundles
WHERE organization_id = '${ORG_ID}';

DELETE FROM rental_driving_analyses
WHERE organization_id = '${ORG_ID}';

UPDATE misuse_cases
SET booking_id = NULL
WHERE organization_id = '${ORG_ID}' AND booking_id IS NOT NULL;

UPDATE misuse_cases
SET customer_id = NULL
WHERE organization_id = '${ORG_ID}' AND customer_id IS NOT NULL;

DELETE FROM vehicle_damages vd
USING bookings b
WHERE vd.booking_id = b.id AND b.organization_id = '${ORG_ID}';

DELETE FROM vehicle_damages vd
USING customers c
WHERE vd.customer_id = c.id AND c.organization_id = '${ORG_ID}';

DELETE FROM whatsapp_conversations
WHERE organization_id = '${ORG_ID}';

DELETE FROM bookings
WHERE organization_id = '${ORG_ID}';

DELETE FROM customers
WHERE organization_id = '${ORG_ID}';

COMMIT;
SQL

echo "--- After cleanup ---"
psql "$DATABASE_URL" -t -A <<SQL
SELECT 'invoices' AS kind, count(*)::text FROM org_invoices WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'bookings', count(*)::text FROM bookings WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'customers', count(*)::text FROM customers WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'tasks', count(*)::text FROM org_tasks WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'invoice_seq', count(*)::text FROM org_invoice_sequences WHERE organization_id='${ORG_ID}';
SQL

psql "$DATABASE_URL" -c "SELECT id, title, dedup_key, status FROM org_tasks WHERE organization_id='${ORG_ID}';"
