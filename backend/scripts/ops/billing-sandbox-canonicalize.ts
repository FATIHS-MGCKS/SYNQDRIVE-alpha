/**
 * Stripe sandbox canonicalization for production-like TEST billing acceptance.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/billing-sandbox-canonicalize.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/billing-sandbox-canonicalize.ts --execute
 *
 * Optional:
 *   --organization-id=<uuid>
 *   --skip-catalog-sync
 *   --skip-subscription-sync
 *   --skip-reconciliation
 *   --reconciliation-only
 *   --mutating-reconciliation   # execute remediation then a normal reconciliation run
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { BillingSandboxCanonicalizationService } from '../../src/modules/billing/migration/billing-sandbox-canonicalization.service';

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

  return {
    dryRun,
    organizationId: orgArg?.split('=')[1]?.trim() || undefined,
    skipCatalogSync: process.argv.includes('--skip-catalog-sync'),
    skipSubscriptionSync: process.argv.includes('--skip-subscription-sync'),
    skipReconciliation: process.argv.includes('--skip-reconciliation'),
    reconciliationDryRunOnly:
      process.argv.includes('--reconciliation-only') ||
      (dryRun && !process.argv.includes('--mutating-reconciliation')),
    mutatingReconciliation: process.argv.includes('--mutating-reconciliation'),
  };
}

async function main() {
  const args = parseArgs();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(BillingSandboxCanonicalizationService);
    const report = await service.run({
      dryRun: args.dryRun,
      organizationId: args.organizationId,
      skipCatalogSync: args.skipCatalogSync,
      skipSubscriptionSync: args.skipSubscriptionSync,
      skipReconciliation: args.skipReconciliation,
      reconciliationDryRunOnly: args.reconciliationDryRunOnly,
    });

    if (!args.dryRun && args.mutatingReconciliation) {
      const mutating = await service.run({
        dryRun: false,
        organizationId: args.organizationId,
        skipCatalogSync: true,
        skipSubscriptionSync: true,
        skipReconciliation: false,
        reconciliationDryRunOnly: false,
      });
      console.log(JSON.stringify({ remediation: report, mutatingReconciliation: mutating }, null, 2));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    const failed = report.summary.failed + report.summary.blocked;
    if (failed > 0) {
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
