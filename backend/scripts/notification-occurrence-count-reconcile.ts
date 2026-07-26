/**
 * Reconcile notifications.occurrence_count with notification_occurrences row counts.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/notification-occurrence-count-reconcile.ts --org <uuid> --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/notification-occurrence-count-reconcile.ts --org <uuid> --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../src/shared/database/prisma.service';
import { NotificationMigrationCliModule } from '../src/modules/notifications/migration/notification-migration-cli.module';
import { parseMigrationCliArgs } from '../src/modules/notifications/migration/notification-migration-cli.util';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

interface DriftRow {
  notificationId: string;
  storedCount: number;
  actualCount: number;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run') || !apply;
  const { orgId } = parseMigrationCliArgs();

  const app = await NestFactory.createApplicationContext(NotificationMigrationCliModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const orgFilter = orgId
      ? `AND n.organization_id = '${orgId.replace(/'/g, "''")}'`
      : '';

    const rows = await prisma.$queryRawUnsafe<DriftRow[]>(`
      SELECT
        n.id AS "notificationId",
        n.occurrence_count::int AS "storedCount",
        COUNT(o.id)::int AS "actualCount"
      FROM notifications n
      LEFT JOIN notification_occurrences o ON o.notification_id = n.id
      WHERE 1=1 ${orgFilter}
      GROUP BY n.id, n.occurrence_count
      HAVING n.occurrence_count <> COUNT(o.id)
      ORDER BY ABS(n.occurrence_count - COUNT(o.id)) DESC
    `);

    console.log(
      `[occurrence-reconcile] mode=${dryRun ? 'dry-run' : 'apply'} org=${orgId ?? 'ALL'} driftRows=${rows.length}`,
    );

    if (rows.length === 0) {
      process.exit(0);
    }

    for (const row of rows.slice(0, 20)) {
      console.log(
        `  ${row.notificationId}: stored=${row.storedCount} actual=${row.actualCount}`,
      );
    }
    if (rows.length > 20) {
      console.log(`  ... and ${rows.length - 20} more`);
    }

    if (dryRun) {
      process.exit(1);
    }

    let updated = 0;
    for (const row of rows) {
      await prisma.notification.update({
        where: { id: row.notificationId },
        data: { occurrenceCount: row.actualCount },
      });
      updated += 1;
    }

    console.log(`[occurrence-reconcile] updated ${updated} notifications`);
    process.exit(0);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[occurrence-reconcile] Failed:', err);
  process.exit(1);
});
