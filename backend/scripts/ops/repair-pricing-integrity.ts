/**
 * Controlled pricing integrity repair (dry-run by default).
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-pricing-integrity.ts --organization-id=<uuid> --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-pricing-integrity.ts --organization-id=<uuid> --execute --confirm
 *
 * Repairs only unambiguous cases:
 * - expire stale ACTIVE quotes past expiresAt
 * - deactivate assignments on inactive tariff groups
 *
 * Does NOT: rewrite snapshots, change booking prices, bulk-fix 177€ deposits.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PricingIntegrityAuditService } from '../../src/modules/pricing/pricing-integrity-audit.service';

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
  const confirm = process.argv.includes('--confirm');
  const orgArg = process.argv.find((a) => a.startsWith('--organization-id='));
  const organizationId = orgArg?.split('=')[1]?.trim();

  if (!organizationId) {
    console.error('--organization-id=<uuid> is required');
    process.exit(1);
  }
  if (dryRun === execute) {
    console.error('Pass exactly one of --dry-run or --execute');
    process.exit(1);
  }

  return { dryRun, execute, confirm, organizationId };
}

async function main() {
  const args = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const audit = app.get(PricingIntegrityAuditService);
    const report = await audit.runRepair({
      organizationId: args.organizationId,
      dryRun: args.dryRun,
      confirmed: args.confirm,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!args.confirm) {
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
