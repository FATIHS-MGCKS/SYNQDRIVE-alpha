#!/usr/bin/env bash
set -euo pipefail
export DATABASE_URL="$(grep '^DATABASE_URL=' /opt/synqdrive/shared/backend.env | cut -d= -f2- | sed 's/?.*$//')"
ORG_ID='faa710c9-6d91-4079-a7d5-91fdccdec14a'

psql "$DATABASE_URL" -t -A <<SQL
SELECT 'invoices' AS kind, count(*)::text FROM org_invoices WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'bookings', count(*)::text FROM bookings WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'customers', count(*)::text FROM customers WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'tasks', count(*)::text FROM org_tasks WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'gen_docs', count(*)::text FROM generated_documents WHERE organization_id='${ORG_ID}'
UNION ALL SELECT 'invoice_seq', count(*)::text FROM org_invoice_sequences WHERE organization_id='${ORG_ID}';
SQL

psql "$DATABASE_URL" -c "SELECT id, title, type, status, booking_id, customer_id, invoice_number_display FROM org_invoices WHERE organization_id='${ORG_ID}';"
