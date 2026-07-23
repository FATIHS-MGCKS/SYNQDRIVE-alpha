/**
 * Idempotent migration of legacy handover signature data-URLs to private storage.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/booking-handover-signature-migration.ts --org <uuid> --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/booking-handover-signature-migration.ts --org <uuid> --apply
 *   npx ts-node -r tsconfig-paths/register scripts/booking-handover-signature-migration.ts --org <uuid> --apply --checkpoint /tmp/sig-migration.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { BookingHandoverSignatureMigrationCliModule } from '../src/modules/bookings/signature/migration/booking-handover-signature-migration-cli.module';
import { BookingHandoverSignatureMigrationService } from '../src/modules/bookings/signature/migration/booking-handover-signature-migration.service';
import type { HandoverSignatureMigrationCheckpoint } from '../src/modules/bookings/signature/migration/booking-handover-signature-migration.service';

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

  let checkpoint: HandoverSignatureMigrationCheckpoint | null = null;
  if (checkpointPath && fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(
      fs.readFileSync(checkpointPath, 'utf8'),
    ) as HandoverSignatureMigrationCheckpoint;
  }

  const app = await NestFactory.createApplicationContext(
    BookingHandoverSignatureMigrationCliModule,
    { logger: ['error', 'warn', 'log'] },
  );

  try {
    const migration = app.get(BookingHandoverSignatureMigrationService);
    const result = await migration.run({
      organizationId: orgId,
      mode: dryRun ? 'dry_run' : 'apply',
      checkpoint,
    });

    console.log(JSON.stringify(result, null, 2));

    if (checkpointPath) {
      fs.writeFileSync(checkpointPath, JSON.stringify(result.checkpoint, null, 2), 'utf8');
      console.error(`[signature-migration] Checkpoint saved to ${checkpointPath}`);
    }

    process.exit(result.failures.length > 0 ? 1 : 0);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[signature-migration] Failed:', err);
  process.exit(1);
});
