/**
 * Reconcile vehicle_tire_setups counters from tire_trip_usage_ledger source of truth.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/ops/tire-reconcile-setup-aggregates.ts --dry-run --organization-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/tire-reconcile-setup-aggregates.ts --execute --organization-id=<uuid> --operator=ops --reason="..."
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { TireSetupStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { TireTripUsageLedgerReconciliationService } from '../../src/modules/vehicle-intelligence/tires/tire-trip-usage-ledger-reconciliation.service';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function loadEnv(): void {
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

async function main(): Promise<void> {
  loadEnv();

  const execute = hasFlag('--execute');
  const dryRun = hasFlag('--dry-run');
  if (execute === dryRun) {
    throw new Error('Pass exactly one of --dry-run or --execute');
  }

  const organizationId = parseArg('--organization-id');
  const setupId = parseArg('--setup-id');
  const operator = parseArg('--operator') ?? 'cloud-agent';
  const reason = parseArg('--reason') ?? 'ledger_aggregate_reconciliation';

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const reconciliation = app.get(TireTripUsageLedgerReconciliationService);

    let setupIds: string[] = [];
    if (setupId) {
      setupIds = [setupId];
    } else if (organizationId) {
      const rows = await prisma.vehicleTireSetup.findMany({
        where: {
          organizationId,
          status: TireSetupStatus.ACTIVE,
          removedAt: null,
        },
        select: { id: true },
      });
      setupIds = rows.map((row) => row.id);
    } else {
      throw new Error('Pass --organization-id or --setup-id');
    }

    const result = execute
      ? await reconciliation.repairSetupAggregates(setupIds, { operator, reason })
      : await reconciliation.dryRunReconcileSetupAggregates(setupIds, { operator, reason });

    console.log(
      JSON.stringify(
        {
          mode: execute ? 'execute' : 'dry-run',
          organizationId: organizationId ?? null,
          setupCount: setupIds.length,
          repaired: result.repaired,
          unchanged: result.unchanged,
          diffCount: result.diffs.filter((d) => d.hasDiff).length,
          diffs: result.diffs.map((d) => ({
            setupId: d.setupId,
            vehicleId: d.vehicleId,
            hasDiff: d.hasDiff,
            current: d.current,
            expectedFromLedger: d.expectedFromLedger,
            delta: d.delta,
            activeLedgerRows: d.activeLedgerRows,
          })),
          errors: result.errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
