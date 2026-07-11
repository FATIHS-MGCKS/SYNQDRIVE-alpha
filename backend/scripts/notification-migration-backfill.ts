/**
 * Idempotent V2 notification backfill from DashboardInsights.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <uuid> --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <uuid> --apply
 *   npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <uuid> --apply --checkpoint /tmp/checkpoint.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { NotificationMigrationCliModule } from '../src/modules/notifications/migration/notification-migration-cli.module';
import { NotificationMigrationBackfillService } from '../src/modules/notifications/migration/notification-migration-backfill.service';
import type { NotificationMigrationCheckpoint } from '../src/modules/notifications/migration/notification-migration.types';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const orgId = argValue('--org');
  if (!orgId) {
    console.error('Required: --org <organizationId>');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run') || !apply;
  const checkpointPath = argValue('--checkpoint');
  const includeInactive = process.argv.includes('--include-inactive');

  let checkpoint: NotificationMigrationCheckpoint | null = null;
  if (checkpointPath && fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as NotificationMigrationCheckpoint;
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
    });

    console.log(JSON.stringify(result, null, 2));

    if (checkpointPath) {
      fs.writeFileSync(checkpointPath, JSON.stringify(result.checkpoint, null, 2), 'utf8');
      console.error(`[backfill] Checkpoint saved to ${checkpointPath}`);
    }

    process.exit(result.failures.length > 0 ? 1 : 0);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[backfill] Failed:', err);
  process.exit(1);
});
