/**
 * Read-only P0.3 Fleet DTO verification — exercises the actual consumer path:
 *
 *   VehiclesService.getFleetMapData()
 *   → VehicleOperationalProjectionService.getVehicleProjections() (batch)
 *   → FleetOperationalAvailabilityDto
 *
 * NEVER mutates production data.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/shadow-fleet-operational-availability-readonly.ts \
 *     --organization-id=<uuid> --license-plate="WOB L 7503" --license-plate="WOB L 9755" --license-plate="HMÜ C 215"
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';

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

function normalizePlate(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

async function main(): Promise<void> {
  const organizationId =
    parseArg('--organization-id') ?? process.env.ORG_ID?.trim();
  const licensePlates = parseArgs('--license-plate');
  const vehicleIds = parseArgs('--vehicle-id');

  if (!organizationId) {
    console.error(
      'Usage: shadow-fleet-operational-availability-readonly.ts --organization-id=<uuid> (--license-plate=<plate> | --vehicle-id=<uuid>)+',
    );
    process.exit(1);
  }

  if (licensePlates.length === 0 && vehicleIds.length === 0) {
    console.error('Provide at least one --license-plate or --vehicle-id');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const vehiclesService = app.get(VehiclesService);

    const resolvedIds = new Set<string>(vehicleIds);
    const plateToId = new Map<string, string>();

    if (licensePlates.length > 0) {
      const orgVehicles = await prisma.vehicle.findMany({
        where: { organizationId },
        select: { id: true, licensePlate: true },
      });
      for (const plate of licensePlates) {
        const normalized = normalizePlate(plate);
        const match = orgVehicles.find(
          (v) => v.licensePlate && normalizePlate(v.licensePlate) === normalized,
        );
        if (!match) {
          const fuzzy = orgVehicles.filter((v) =>
            v.licensePlate?.toUpperCase().includes(normalized.replace(/\s/g, '')),
          );
          console.error(
            JSON.stringify({
              error: 'vehicle_not_found_by_plate',
              licensePlate: plate,
              normalized,
              fuzzyCandidates: fuzzy.map((v) => ({
                id: v.id,
                licensePlate: v.licensePlate,
              })),
            }),
          );
          continue;
        }
        resolvedIds.add(match.id);
        plateToId.set(match.id, match.licensePlate ?? plate);
      }
    }

    if (resolvedIds.size === 0) {
      console.error('No vehicles resolved');
      process.exit(1);
    }

    const fleetMap = await vehiclesService.getFleetMapData(organizationId);
    const targets = fleetMap.filter((row) => resolvedIds.has(row.id));

    const report = {
      organizationId,
      path: 'VehiclesService.getFleetMapData',
      fleetMapVehicleCount: fleetMap.length,
      targetCount: targets.length,
      vehicles: targets.map((row) => ({
        vehicleId: row.id,
        licensePlate: row.licensePlate ?? plateToId.get(row.id) ?? null,
        legacyStatus: row.status,
        operationalStateStatus: row.operationalState?.status ?? null,
        operationalAvailability: row.operationalAvailability ?? null,
        bookingContext: {
          activeBookingId: row.activeBookingId ?? null,
          reservedBookingId: row.reservedBookingId ?? null,
        },
      })),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
