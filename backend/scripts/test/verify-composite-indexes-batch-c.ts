/**
 * Verifies all indexes from 20260413230000_add_composite_indexes_batch_c exist and are valid.
 * Run after apply-composite-indexes.ts on disposable Postgres only.
 */
import { PrismaClient } from '@prisma/client';

const EXPECTED_INDEXES: { name: string; table: string }[] = [
  { name: 'vehicle_trips_vehicle_id_start_time_idx', table: 'vehicle_trips' },
  { name: 'vehicle_dtc_events_vehicle_id_last_seen_at_idx', table: 'vehicle_dtc_events' },
  { name: 'vehicle_dtc_events_vehicle_id_is_active_idx', table: 'vehicle_dtc_events' },
  { name: 'driving_events_vehicle_id_recorded_at_idx', table: 'driving_events' },
  { name: 'driving_events_trip_id_event_type_idx', table: 'driving_events' },
  { name: 'trip_behavior_events_trip_id_event_category_idx', table: 'trip_behavior_events' },
  { name: 'dimo_poll_logs_vehicle_id_created_at_idx', table: 'dimo_poll_logs' },
  { name: 'activity_logs_organization_id_created_at_idx', table: 'activity_logs' },
  { name: 'bookings_vehicle_id_status_start_date_idx', table: 'bookings' },
  { name: 'bookings_organization_id_status_idx', table: 'bookings' },
  { name: 'org_invoices_organization_id_status_idx', table: 'org_invoices' },
  { name: 'org_invoices_organization_id_invoice_date_idx', table: 'org_invoices' },
  { name: 'org_tasks_organization_id_status_idx', table: 'org_tasks' },
  { name: 'org_tasks_organization_id_due_date_idx', table: 'org_tasks' },
];

async function main() {
  const prisma = new PrismaClient();
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const { name, table } of EXPECTED_INDEXES) {
    const rows = await prisma.$queryRawUnsafe<
      { indexname: string; tablename: string; indexdef: string }[]
    >(
      `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      name,
    );
    if (rows.length === 0) {
      missing.push(name);
      continue;
    }
    if (rows[0].tablename !== table) {
      invalid.push(`${name}: wrong table ${rows[0].tablename}`);
    }
    const validRows = await prisma.$queryRawUnsafe<{ valid: boolean }[]>(
      `SELECT i.indisvalid AS valid FROM pg_class c JOIN pg_index i ON c.oid = i.indexrelid WHERE c.relname = $1`,
      name,
    );
    if (validRows.length === 0 || validRows[0].valid !== true) {
      invalid.push(`${name}: index not valid`);
    }
  }

  await prisma.$disconnect();

  if (missing.length > 0 || invalid.length > 0) {
    console.error('BATCH_C_INDEX_VERIFY=FAIL');
    if (missing.length) console.error('missing:', missing.join(', '));
    if (invalid.length) console.error('invalid:', invalid.join('; '));
    process.exit(1);
  }
  console.log(`BATCH_C_INDEX_VERIFY=PASS count=${EXPECTED_INDEXES.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});