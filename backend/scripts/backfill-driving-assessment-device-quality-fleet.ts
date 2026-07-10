/**
 * Fleet-wide backfill for LTE_R1 driving-assessment device quality.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-driving-assessment-device-quality-fleet.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-driving-assessment-device-quality-fleet.ts --execute
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-driving-assessment-device-quality-fleet.ts --execute --organization-id=<uuid>
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DrivingAssessmentDeviceQualityService } from '../src/modules/vehicle-intelligence/trips/driving-assessment-device-quality.service';
import { PrismaService } from '../src/shared/database/prisma.service';

{
  const envPath = path.resolve(__dirname, '..', '.env');
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
  };
}

async function main() {
  const args = parseArgs();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const quality = app.get(DrivingAssessmentDeviceQualityService);

    const vehicles = await prisma.vehicle.findMany({
      where: {
        hardwareType: 'LTE_R1',
        ...(args.organizationId ? { organizationId: args.organizationId } : {}),
      },
      select: { id: true, licensePlate: true, organizationId: true },
      orderBy: { licensePlate: 'asc' },
    });

    console.log(`[fleet-backfill-device-quality] ${vehicles.length} LTE_R1 vehicle(s)`);

    const report: Array<{
      vehicleId: string;
      licensePlate: string | null;
      status: string | null;
      degradedSince: string | null;
    }> = [];

    for (const vehicle of vehicles) {
      if (args.dryRun) {
        report.push({
          vehicleId: vehicle.id,
          licensePlate: vehicle.licensePlate,
          status: 'dry-run',
          degradedSince: null,
        });
        continue;
      }

      await quality.reconcileVehicle(vehicle.id);
      const status = await quality.getVehicleQualityStatus(vehicle.id);
      report.push({
        vehicleId: vehicle.id,
        licensePlate: vehicle.licensePlate,
        status: status?.status ?? 'NORMAL',
        degradedSince: status?.degradedSince ?? null,
      });
      console.log(
        `[fleet-backfill-device-quality] ${vehicle.licensePlate ?? vehicle.id} → ${status?.status ?? 'NORMAL'}`,
      );
    }

    console.log(JSON.stringify({ count: report.length, vehicles: report }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('[fleet-backfill-device-quality] Failed:', err);
  process.exit(1);
});
