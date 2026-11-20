/**
 * Verifies all indexes from 20260413230000_add_composite_indexes_batch_c exist,
 * are valid, and match historical migration semantics (btree columns + order).
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

type ExpectedIndex = {
  name: string;
  table: string;
  columns: string[];
};

/** Parsed from migration.sql / apply-composite-indexes.ts — must stay aligned. */
const EXPECTED_INDEXES: ExpectedIndex[] = [
  { name: 'vehicle_trips_vehicle_id_start_time_idx', table: 'vehicle_trips', columns: ['vehicle_id', 'start_time'] },
  {
    name: 'vehicle_dtc_events_vehicle_id_last_seen_at_idx',
    table: 'vehicle_dtc_events',
    columns: ['vehicle_id', 'last_seen_at'],
  },
  { name: 'vehicle_dtc_events_vehicle_id_is_active_idx', table: 'vehicle_dtc_events', columns: ['vehicle_id', 'is_active'] },
  { name: 'driving_events_vehicle_id_recorded_at_idx', table: 'driving_events', columns: ['vehicle_id', 'recorded_at'] },
  { name: 'driving_events_trip_id_event_type_idx', table: 'driving_events', columns: ['trip_id', 'event_type'] },
  {
    name: 'trip_behavior_events_trip_id_event_category_idx',
    table: 'trip_behavior_events',
    columns: ['trip_id', 'event_category'],
  },
  { name: 'dimo_poll_logs_vehicle_id_created_at_idx', table: 'dimo_poll_logs', columns: ['vehicle_id', 'created_at'] },
  { name: 'activity_logs_organization_id_created_at_idx', table: 'activity_logs', columns: ['organization_id', 'created_at'] },
  { name: 'bookings_vehicle_id_status_start_date_idx', table: 'bookings', columns: ['vehicle_id', 'status', 'start_date'] },
  { name: 'bookings_organization_id_status_idx', table: 'bookings', columns: ['organization_id', 'status'] },
  { name: 'org_invoices_organization_id_status_idx', table: 'org_invoices', columns: ['organization_id', 'status'] },
  { name: 'org_invoices_organization_id_invoice_date_idx', table: 'org_invoices', columns: ['organization_id', 'invoice_date'] },
  { name: 'org_tasks_organization_id_status_idx', table: 'org_tasks', columns: ['organization_id', 'status'] },
  { name: 'org_tasks_organization_id_due_date_idx', table: 'org_tasks', columns: ['organization_id', 'due_date'] },
];

function extractBtreeColumns(indexdef: string): string[] | null {
  const m = indexdef.match(/USING btree \(([^)]+)\)/i);
  if (!m) return null;
  return m[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
}

async function main() {
  const migrationPath = path.join(
    __dirname,
    '../../prisma/migrations/20260413230000_add_composite_indexes_batch_c/migration.sql',
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const concurrentCount = (migrationSql.match(/^CREATE INDEX CONCURRENTLY/gm) ?? []).length;
  if (concurrentCount !== EXPECTED_INDEXES.length) {
    console.error(
      `BATCH_C_INDEX_VERIFY=FAIL migration statement count ${concurrentCount} != verifier ${EXPECTED_INDEXES.length}`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const expected of EXPECTED_INDEXES) {
    const { name, table, columns } = expected;
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

    const meta = await prisma.$queryRawUnsafe<
      { valid: boolean; unique: boolean; partial: boolean }[]
    >(
      `SELECT i.indisvalid AS valid, i.indisunique AS unique,
              (i.indpred IS NOT NULL) AS partial
       FROM pg_class c
       JOIN pg_index i ON c.oid = i.indexrelid
       WHERE c.relname = $1`,
      name,
    );
    if (meta.length === 0 || meta[0].valid !== true) {
      invalid.push(`${name}: index not valid`);
    }
    if (meta[0]?.unique === true) {
      invalid.push(`${name}: must not be UNIQUE`);
    }
    if (meta[0]?.partial === true) {
      invalid.push(`${name}: must not be partial (no predicate)`);
    }

    const defCols = extractBtreeColumns(rows[0].indexdef);
    if (!defCols) {
      invalid.push(`${name}: not a btree index (${rows[0].indexdef})`);
    } else if (defCols.length !== columns.length || defCols.some((c, i) => c !== columns[i])) {
      invalid.push(`${name}: column mismatch expected [${columns.join(', ')}] got [${defCols.join(', ')}]`);
    }
  }

  await prisma.$disconnect();

  if (missing.length > 0 || invalid.length > 0) {
    console.error('BATCH_C_INDEX_VERIFY=FAIL');
    if (missing.length) console.error('missing:', missing.join(', '));
    if (invalid.length) console.error('invalid:', invalid.join('; '));
    process.exit(1);
  }
  console.log(`BATCH_C_INDEX_VERIFY=PASS count=${EXPECTED_INDEXES.length} definition_parity=OK`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});