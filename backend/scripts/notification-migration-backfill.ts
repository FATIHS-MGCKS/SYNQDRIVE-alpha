/**
 * Idempotent V2 notification backfill from DashboardInsights.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <uuid> --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <uuid> --dry-run --out /tmp/backfill.json
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <uuid> --apply
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <uuid> --apply --checkpoint /tmp/checkpoint.json
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <uuid> --apply --batch-size 50 --checkpoint /tmp/checkpoint.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { NotificationMigrationCliModule } from '../src/modules/notifications/migration/notification-migration-cli.module';
import { NotificationMigrationBackfillService } from '../src/modules/notifications/migration/notification-migration-backfill.service';
import type { NotificationMigrationCheckpoint } from '../src/modules/notifications/migration/notification-migration.types';
import {
  loadCheckpoint,
  parseMigrationCliArgs,
  saveCheckpoint,
  writeMigrationJsonReport,
} from '../src/modules/notifications/migration/notification-migration-cli.util';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  const {
    orgId,
    outPath,
    checkpointPath,
    batchSize,
    includeInactive,
    apply,
    dryRun,
  } = parseMigrationCliArgs();

  if (!orgId) {
    console.error('Required: --org <organizationId>');
    process.exit(1);
  }

  if (apply && dryRun) {
    console.error('Use either --dry-run or --apply, not both');
    process.exit(1);
  }

  let checkpoint: NotificationMigrationCheckpoint | null = null;
  try {
    checkpoint = loadCheckpoint<NotificationMigrationCheckpoint>(checkpointPath, orgId);
  } catch (err) {
    console.error(`[backfill] ${(err as Error).message}`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(NotificationMigrationCliModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const backfill = app.get(NotificationMigrationBackfillService);
    const result = await backfill.run({
      organizationId: orgId,
      mode: dryRun ? 'dry_run' : 'apply',
      checkpoint,
      includeInactive,
      batchSize,
    });

    writeMigrationJsonReport(result, outPath, 'backfill');
    saveCheckpoint(checkpointPath, result.checkpoint, { apply });

    if (dryRun) {
      console.error('[backfill] Dry-run complete — no database writes, checkpoint not saved');
    }

    console.error(
      `[backfill] Summary: analyzed=${result.stats.analyzed} migrated=${result.stats.migrated} merged=${result.stats.merged} skipped=${result.stats.skipped} unresolved=${result.stats.unresolved} failed=${result.stats.failed}`,
    );

    process.exit(result.failures.length > 0 ? 1 : 0);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[backfill] Failed:', err);
  process.exit(1);
});
