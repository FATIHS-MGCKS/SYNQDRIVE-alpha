/**
 * Read-only shadow comparison: legacy fleet business status vs P0.2 projection.
 *
 * NEVER mutates production data.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/shadow-vehicle-operational-projection-readonly.ts \
 *     --organization-id=<uuid> --license-plate="WOB L 7503"
 *
 * Multiple plates:
 *   --license-plate="HMÜ C 215" --license-plate="WOB L 9755"
 *
 * By vehicle id:
 *   --vehicle-id=<uuid>
 *
 * Output: JSON to stdout (redacts VIN; license plates only when explicitly requested).
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import { VehicleOperationalProjectionService } from '../../src/modules/vehicles/operational/projection/vehicle-operational-projection.service';

{
  const envPath =
    process.env.SYNQDRIVE_BACKEND_ENV ??
    path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
      }
    }
  }
}

function parseArgs(prefix: string): string[] {
  return process.argv
    .filter((a) => a.startsWith(`${prefix}=`))
    .map((a) => a.split('=').slice(1).join('=').trim())
    .filter(Boolean);
}

function parseArg(prefix: string): string | undefined {
  return parseArgs(prefix)[0];
}

async function main(): Promise<void> {
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim();
  const licensePlates = parseArgs('--license-plate');
  const vehicleIds = parseArgs('--vehicle-id');

  if (!organizationId) {
    console.error(
      'Usage: shadow-vehicle-operational-projection-readonly.ts --organization-id=<uuid> (--license-plate=<plate> | --vehicle-id=<uuid>)',
    );
    process.exit(1);
  }

  if (licensePlates.length === 0 && vehicleIds.length === 0) {
    console.error('Provide at least one --license-plate or --vehicle-id');
    process.exit(1);
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const vehiclesService = app.get(VehiclesService);
    const projectionService = app.get(VehicleOperationalProjectionService);

    const resolvedIds: Array<{ vehicleId: string; licensePlate: string | null }> = [];

    if (vehicleIds.length > 0) {
      const rows = await prisma.vehicle.findMany({
        where: { organizationId, id: { in: vehicleIds } },
        select: { id: true, licensePlate: true, status: true },
      });
      for (const row of rows) {
        resolvedIds.push({ vehicleId: row.id, licensePlate: row.licensePlate });
      }
    }

    for (const plate of licensePlates) {
      const row = await prisma.vehicle.findFirst({
        where: { organizationId, licensePlate: plate },
        select: { id: true, licensePlate: true, status: true },
      });
      if (row) {
        resolvedIds.push({ vehicleId: row.id, licensePlate: row.licensePlate });
      } else {
        resolvedIds.push({ vehicleId: `NOT_FOUND:${plate}`, licensePlate: plate });
      }
    }

    const uniqueIds = [
      ...new Set(resolvedIds.filter((r) => !r.vehicleId.startsWith('NOT_FOUND:')).map((r) => r.vehicleId)),
    ];

    const now = new Date();
    const projections = await projectionService.getVehicleProjections({
      organizationId,
      vehicleIds: uniqueIds,
      now,
    });

    const report = [];

    for (const entry of resolvedIds) {
      if (entry.vehicleId.startsWith('NOT_FOUND:')) {
        report.push({
          licensePlate: entry.licensePlate,
          found: false,
        });
        continue;
      }

      const vehicle = await prisma.vehicle.findFirst({
        where: { id: entry.vehicleId, organizationId },
        select: {
          id: true,
          licensePlate: true,
          status: true,
          latestState: {
            select: {
              odometerKm: true,
              evSoc: true,
              fuelLevelRelative: true,
              fuelLevelAbsolute: true,
              rawPayloadJson: true,
            },
          },
        },
      });

      if (!vehicle) {
        report.push({ vehicleId: entry.vehicleId, found: false });
        continue;
      }

      const legacyCtx = vehiclesService.deriveFleetStatusContext({
        vehicle,
        state: vehicle.latestState,
        bookingCtx: null,
        pickupOdoByBooking: new Map(),
        bookingContextLoadFailed: false,
      });

      const projection = projections.get(entry.vehicleId);

      report.push({
        licensePlate: vehicle.licensePlate,
        vehicleId: vehicle.id,
        found: true,
        legacy: {
          persistedStatus: vehicle.status,
          fleetOperationalToken: legacyCtx.operationalState.status,
          fleetDisplayStatus: legacyCtx.status,
        },
        p0_2: projection
          ? {
              businessState: projection.businessState,
              operationalAvailability: projection.operationalAvailability,
              healthEvaluability: projection.healthEvaluability,
              attention: projection.attention,
              connectivity: {
                overallState: projection.connectivity.overallState,
                telemetryState: projection.connectivity.telemetryState,
                physicalDeviceState: projection.connectivity.physicalDeviceState,
              },
              operatorSummary: projection.operatorSummary,
              generatedAt: projection.generatedAt,
            }
          : null,
        delta: projection
          ? {
              businessVsOperationalMismatch:
                legacyCtx.operationalState.status === 'AVAILABLE' &&
                projection.operationalAvailability === 'NEEDS_VERIFICATION',
            }
          : null,
      });
    }

    console.log(
      JSON.stringify(
        {
          organizationId,
          comparedAt: now.toISOString(),
          vehicles: report,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
