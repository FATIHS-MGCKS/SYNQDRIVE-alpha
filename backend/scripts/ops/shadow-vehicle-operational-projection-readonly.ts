/**
 * Read-only shadow comparison: legacy fleet business status vs P0.2 projection.
 *
 * Uses one batch business-context load shared by legacy fleet derivation and P0.2.
 * P0.2 projections are produced by VehicleOperationalProjectionService (canonical P0.1 connectivity).
 *
 * NEVER mutates production data.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/shadow-vehicle-operational-projection-readonly.ts \
 *     --organization-id=<uuid> --license-plate="WOB L 7503"
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import { VehicleOperationalProjectionService } from '../../src/modules/vehicles/operational/projection/vehicle-operational-projection.service';
import { RentalHealthSummaryService } from '../../src/modules/rental-health/rental-health-summary.service';
import { businessStateFromFleetContext } from '../../src/modules/vehicles/operational/projection/business-state.adapter';

const VEHICLE_SELECT = {
  id: true,
  organizationId: true,
  licensePlate: true,
  status: true,
  tankCapacityLiters: true,
  latestState: {
    select: {
      odometerKm: true,
      evSoc: true,
      fuelLevelRelative: true,
      fuelLevelAbsolute: true,
      rawPayloadJson: true,
    },
  },
} as const;

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
    const rentalHealthSummary = app.get(RentalHealthSummaryService);

    const notFoundPlates: string[] = [];
    const targetIds = new Set<string>();

    if (vehicleIds.length > 0) {
      for (const id of vehicleIds) targetIds.add(id);
    }

    for (const plate of licensePlates) {
      const row = await prisma.vehicle.findFirst({
        where: { organizationId, licensePlate: plate },
        select: { id: true },
      });
      if (row) {
        targetIds.add(row.id);
      } else {
        notFoundPlates.push(plate);
      }
    }

    const vehicles = await prisma.vehicle.findMany({
      where: {
        organizationId,
        id: { in: [...targetIds] },
      },
      select: VEHICLE_SELECT,
    });

    const now = new Date();
    const vehicleIdList = vehicles.map((v) => v.id);

    const [fleetContextMap, projections, healthRows] = await Promise.all([
      vehiclesService.deriveFleetStatusContextBatch(organizationId, vehicles),
      projectionService.getVehicleProjections({
        organizationId,
        vehicleIds: vehicleIdList,
        now,
      }),
      vehicleIdList.length > 0
        ? rentalHealthSummary.getFleetRowsBatch(organizationId, vehicleIdList)
        : Promise.resolve([]),
    ]);

    const healthByVehicleId = new Map(healthRows.map((row) => [row.vehicle_id, row]));

    const report = vehicles.map((vehicle) => {
      const fleetCtx = fleetContextMap.get(vehicle.id);
      const projection = projections.get(vehicle.id);
      const healthRow = healthByVehicleId.get(vehicle.id);
      const resolvedBusinessState = fleetCtx
        ? businessStateFromFleetContext({
            vehicleStatus: vehicle.status,
            operationalState: fleetCtx.operationalState,
          })
        : null;

      const legacyToken = fleetCtx?.operationalState.status ?? null;
      const p0Business = projection?.businessState ?? null;

      return {
        licensePlate: vehicle.licensePlate,
        vehicleId: vehicle.id,
        found: true,
        persistedVehicleStatus: vehicle.status,
        resolvedBusinessContext: fleetCtx
          ? {
              operationalToken: fleetCtx.operationalState.status,
              fleetDisplayStatus: fleetCtx.status,
              dataQualityState: fleetCtx.operationalState.dataQualityState,
              isReliable: fleetCtx.operationalState.isReliable,
              source: fleetCtx.operationalState.source,
              reason: fleetCtx.operationalState.reason,
              activeBookingId: fleetCtx.bookingDto.activeBookingId,
              reservedBookingId: fleetCtx.bookingDto.reservedBookingId,
            }
          : null,
        legacy: fleetCtx
          ? {
              fleetOperationalToken: legacyToken,
              fleetDisplayStatus: fleetCtx.status,
            }
          : null,
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
              operatorSummary: {
                primaryReason: projection.operatorSummary.primaryReason,
                reasonCodes: projection.operatorSummary.reasonCodes,
                recommendedAction: projection.operatorSummary.recommendedAction,
              },
              generatedAt: projection.generatedAt,
            }
          : null,
        healthShadow: {
          healthSourceAvailable: !!healthRow,
          healthPipelineAvailability: healthRow?.availability ?? null,
          healthOverallState: healthRow?.overall_state ?? null,
        },
        delta: projection && fleetCtx
          ? {
              businessStateMismatch: p0Business !== resolvedBusinessState,
              businessVsOperationalMismatch:
                resolvedBusinessState === 'AVAILABLE' &&
                projection.operationalAvailability === 'NEEDS_VERIFICATION',
              intentionalOperationalGap:
                resolvedBusinessState === 'AVAILABLE' &&
                projection.operationalAvailability === 'NEEDS_VERIFICATION',
            }
          : null,
      };
    });

    for (const plate of notFoundPlates) {
      report.push({
        licensePlate: plate,
        vehicleId: null,
        found: false,
        persistedVehicleStatus: null,
        resolvedBusinessContext: null,
        legacy: null,
        p0_2: null,
        healthShadow: null,
        delta: null,
      } as any);
    }

    console.log(
      JSON.stringify(
        {
          organizationId,
          comparedAt: now.toISOString(),
          batchLoads: {
            vehicles: vehicles.length,
            fleetStatusContextBatch: 1,
            p0_2ProjectionBatch: 1,
            healthBatch: vehicleIdList.length > 0 ? 1 : 0,
          },
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
