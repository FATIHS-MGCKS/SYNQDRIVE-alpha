/**
 * Applies `prisma/migrations/20260413230000_add_composite_indexes_batch_c/migration.sql`
 * one statement at a time via Prisma's $executeRawUnsafe, which does NOT wrap
 * statements in a transaction. Needed because `CREATE INDEX CONCURRENTLY`
 * cannot run inside Postgres transactions and `prisma migrate deploy`
 * / `prisma db execute` both use transactional execution.
 *
 * Run once:
 *   npx ts-node scripts/apply-composite-indexes.ts
 *
 * Afterwards, mark the migration as applied:
 *   npx prisma migrate resolve --applied 20260413230000_add_composite_indexes_batch_c
 */
import { PrismaClient } from '@prisma/client';

const STATEMENTS: string[] = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicle_trips_vehicle_id_start_time_idx" ON "vehicle_trips" ("vehicle_id", "start_time")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicle_dtc_events_vehicle_id_last_seen_at_idx" ON "vehicle_dtc_events" ("vehicle_id", "last_seen_at")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicle_dtc_events_vehicle_id_is_active_idx" ON "vehicle_dtc_events" ("vehicle_id", "is_active")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "driving_events_vehicle_id_recorded_at_idx" ON "driving_events" ("vehicle_id", "recorded_at")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "driving_events_trip_id_event_type_idx" ON "driving_events" ("trip_id", "event_type")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "trip_behavior_events_trip_id_event_category_idx" ON "trip_behavior_events" ("trip_id", "event_category")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "dimo_poll_logs_vehicle_id_created_at_idx" ON "dimo_poll_logs" ("vehicle_id", "created_at")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "activity_logs_organization_id_created_at_idx" ON "activity_logs" ("organization_id", "created_at")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookings_vehicle_id_status_start_date_idx" ON "bookings" ("vehicle_id", "status", "start_date")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookings_organization_id_status_idx" ON "bookings" ("organization_id", "status")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "org_invoices_organization_id_status_idx" ON "org_invoices" ("organization_id", "status")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "org_invoices_organization_id_invoice_date_idx" ON "org_invoices" ("organization_id", "invoice_date")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "org_tasks_organization_id_status_idx" ON "org_tasks" ("organization_id", "status")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "org_tasks_organization_id_due_date_idx" ON "org_tasks" ("organization_id", "due_date")`,
];

async function main() {
  const prisma = new PrismaClient();
  console.log(`Executing ${STATEMENTS.length} statements …`);
  for (const stmt of STATEMENTS) {
    const head = stmt.slice(0, 95).replace(/\s+/g, ' ');
    process.stdout.write(`  → ${head}${stmt.length > 95 ? '…' : ''}\n`);
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (err: any) {
      console.error(`    ✗ ${err.message ?? err}`);
      throw err;
    }
  }
  console.log('Done.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
