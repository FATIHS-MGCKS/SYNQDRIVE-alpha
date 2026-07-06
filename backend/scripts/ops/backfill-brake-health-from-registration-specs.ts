/**
 * Safe backfill: initialize BrakeHealthCurrent for vehicles that already have
 * registration/manual brake reference specs but no initialized brake baseline.
 *
 * Uses BrakeLifecycleService.initializeFromRegistration — never direct writes.
 *
 * Usage (on VPS with DATABASE_URL from backend.env):
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-brake-health-from-registration-specs.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-brake-health-from-registration-specs.ts --execute
 *
 * Optional:
 *   --organization-id=<uuid>
 *   --vehicle-id=<uuid>
 *   --limit=<n>
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { BrakeRegistrationBackfillService } from '../../src/modules/vehicle-intelligence/brakes/brake-registration-backfill.service';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const execute = process.argv.includes('--execute');
  if (dryRun === execute) {
    console.error('Pass exactly one of --dry-run or --execute');
    process.exit(1);
  }

  const orgArg = process.argv.find((a) => a.startsWith('--organization-id='));
  const vehicleArg = process.argv.find((a) => a.startsWith('--vehicle-id='));
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));

  return {
    dryRun,
    organizationId: orgArg?.split('=')[1]?.trim() || undefined,
    vehicleId: vehicleArg?.split('=')[1]?.trim() || undefined,
    limit: limitArg ? Number(limitArg.split('=')[1]) : undefined,
  };
}

async function main() {
  const args = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const backfill = app.get(BrakeRegistrationBackfillService);
    const report = await backfill.run({
      dryRun: args.dryRun,
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      limit: Number.isFinite(args.limit) ? args.limit : undefined,
    });

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
