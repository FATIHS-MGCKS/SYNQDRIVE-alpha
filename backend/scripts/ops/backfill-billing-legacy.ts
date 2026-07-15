/**
 * Controlled legacy billing backfill — migrates subscriptions, price books,
 * Stripe IDs and documents vehicle quantities without deleting legacy rows.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --execute
 *
 * Resume after abort:
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-billing-legacy.ts --execute \
 *     --checkpoint-file=/tmp/billing-backfill-checkpoint.json
 *
 * Optional:
 *   --organization-id=<uuid>
 *   --limit=<n>
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { BillingLegacyBackfillService } from '../../src/modules/billing/migration/billing-legacy-backfill.service';
import type { BillingLegacyBackfillCheckpoint } from '../../src/modules/billing/migration/billing-legacy-backfill.types';

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
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const checkpointFileArg = process.argv.find((a) => a.startsWith('--checkpoint-file='));

  let checkpoint: BillingLegacyBackfillCheckpoint | null = null;
  const checkpointPath = checkpointFileArg?.split('=')[1]?.trim();
  if (checkpointPath && fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) as BillingLegacyBackfillCheckpoint;
  }

  return {
    dryRun,
    organizationId: orgArg?.split('=')[1]?.trim() || undefined,
    limit: limitArg ? Number(limitArg.split('=')[1]) : undefined,
    checkpoint,
    checkpointPath,
  };
}

async function main() {
  const args = parseArgs();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const backfill = app.get(BillingLegacyBackfillService);
    const report = await backfill.run({
      dryRun: args.dryRun,
      organizationId: args.organizationId,
      limit: Number.isFinite(args.limit) ? args.limit : undefined,
      checkpoint: args.checkpoint,
    });

    if (args.checkpointPath) {
      fs.writeFileSync(args.checkpointPath, JSON.stringify(report.checkpoint, null, 2));
    }

    console.log(JSON.stringify(report, null, 2));

    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
