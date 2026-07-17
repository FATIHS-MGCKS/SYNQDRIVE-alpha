/**
 * Controlled fleet-wide tire health recalculation (post backfill).
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/tire-fleet-recalculate.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/tire-fleet-recalculate.ts --execute \
 *     --operator=cloud-agent --reason="post-deploy fleet recalc"
 *
 * Optional:
 *   --organization-id=<uuid>
 *   --max-vehicles=<n>   (default 50)
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { TireSetupStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { TireHealthService } from '../../src/modules/vehicle-intelligence/tires/tire-health.service';

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
  const maxVehiclesRaw = parseArg('--max-vehicles');
  const maxVehicles = maxVehiclesRaw ? Number(maxVehiclesRaw) : 50;
  if (!Number.isFinite(maxVehicles) || maxVehicles < 1) {
    throw new Error('--max-vehicles must be a positive number');
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const tireHealth = app.get(TireHealthService);

    const setups = await prisma.vehicleTireSetup.findMany({
      where: {
        status: TireSetupStatus.ACTIVE,
        removedAt: null,
        ...(organizationId ? { organizationId } : {}),
      },
      select: { vehicleId: true },
      distinct: ['vehicleId'],
      take: maxVehicles,
      orderBy: { vehicleId: 'asc' },
    });

    const vehicleIds = setups.map((row) => row.vehicleId);
    const results: Array<{ vehicleId: string; ok: boolean; error?: string }> = [];

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            organizationId: organizationId ?? null,
            vehicleCount: vehicleIds.length,
            vehicleIds,
          },
          null,
          2,
        ),
      );
      return;
    }

    for (const vehicleId of vehicleIds) {
      try {
        await tireHealth.recalculate(vehicleId, {
          force: false,
          reason: parseArg('--reason') ?? 'fleet_recalculate',
        });
        results.push({ vehicleId, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ vehicleId, ok: false, error: message });
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: 'execute',
          operator: parseArg('--operator') ?? null,
          reason: parseArg('--reason') ?? null,
          organizationId: organizationId ?? null,
          attempted: vehicleIds.length,
          succeeded: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          results,
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
