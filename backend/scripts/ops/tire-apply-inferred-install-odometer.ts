/**
 * Supervised install odometer anchor from trip-subtraction inference.
 *
 * For setups missing installed_odometer_km when historical backfill is manual-review only:
 *   installOdo ≈ latestTelemetryOdo - sum(finalizedTripKm since installedAt)
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/ops/tire-apply-inferred-install-odometer.ts --dry-run --setup-id=<uuid>
 *   TIRE_ODOMETER_ANCHOR_APPLY_ALLOW_PROD=1 npx ts-node ... --execute --setup-id=<uuid> --operator=ops --reason="..."
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import {
  TireEventType,
  TireOdometerAnchorSource,
  TireOdometerAnchorStatus,
  TireSetupStatus,
} from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { buildSetupOdometerAnchorFields, resolveOdometerAnchor } from '../../src/modules/vehicle-intelligence/tires/tire-odometer-anchor';

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

  const setupId = parseArg('--setup-id');
  if (!setupId) throw new Error('--setup-id is required');

  const operator = parseArg('--operator') ?? 'cloud-agent';
  const reason = parseArg('--reason') ?? 'inferred_install_odometer_from_trip_subtraction';

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const setup = await prisma.vehicleTireSetup.findUnique({
      where: { id: setupId },
      include: {
        vehicle: {
          select: {
            id: true,
            licensePlate: true,
            mileageKm: true,
          },
        },
      },
    });

    if (!setup) throw new Error(`Setup not found: ${setupId}`);
    if (setup.status !== TireSetupStatus.ACTIVE || setup.removedAt != null) {
      throw new Error(`Setup ${setupId} is not ACTIVE`);
    }
    if (setup.installedOdometerKm != null) {
      console.log(
        JSON.stringify(
          {
            mode: dryRun ? 'dry-run' : 'execute',
            skipped: true,
            reason: 'already_anchored',
            installedOdometerKm: setup.installedOdometerKm,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (!setup.installedAt) {
      throw new Error(`Setup ${setupId} has no installedAt`);
    }
    const installedAt = setup.installedAt;

    const [latestState, tripAgg] = await Promise.all([
      prisma.vehicleLatestState.findUnique({
        where: { vehicleId: setup.vehicleId },
        select: {
          odometerKm: true,
          providerSource: true,
          providerFetchedAt: true,
          sourceTimestamp: true,
          lastSeenAt: true,
          source: true,
        },
      }),
      prisma.vehicleTrip.aggregate({
        where: {
          vehicleId: setup.vehicleId,
          endTime: { not: null, gte: installedAt },
        },
        _sum: { distanceKm: true },
        _count: true,
      }),
    ]);

    const latestOdo = latestState?.odometerKm;
    const tripKm = tripAgg._sum.distanceKm ?? 0;
    if (latestOdo == null || !Number.isFinite(latestOdo)) {
      throw new Error(`No telemetry odometer for vehicle ${setup.vehicleId}`);
    }

    const inferredInstallOdo = Math.round((latestOdo - tripKm) * 10) / 10;
    if (inferredInstallOdo < 0) {
      throw new Error(
        `Inferred install odometer negative (${inferredInstallOdo}) — latest=${latestOdo} tripKm=${tripKm}`,
      );
    }

    const plausibilityAnchor = resolveOdometerAnchor({
      context: {
        latestState,
        vehicleMileageKm: setup.vehicle.mileageKm,
        lastKnownOdometerKm: null,
      },
      clientOdometerKm: inferredInstallOdo,
      manualConfirmed: true,
    });

    const anchorFields = buildSetupOdometerAnchorFields({
      odometerKm: inferredInstallOdo,
      source: TireOdometerAnchorSource.HISTORICAL_INFERRED,
      capturedAt: installedAt,
      evidenceId: null,
      status: TireOdometerAnchorStatus.ANCHORED,
      confidence: Math.min(72, plausibilityAnchor.confidence),
      plausibilityIssue: null,
      clientValueIgnored: false,
    });

    const payload = {
      mode: dryRun ? 'dry-run' : 'execute',
      setupId,
      vehicleId: setup.vehicleId,
      licensePlate: setup.vehicle.licensePlate,
      installedAt: installedAt.toISOString(),
      latestTelemetryOdometerKm: latestOdo,
      tripKmSinceInstall: tripKm,
      tripCountSinceInstall: tripAgg._count,
      inferredInstallOdometerKm: inferredInstallOdo,
      anchorFields,
      operator,
      reason,
    };

    if (dryRun) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    if (!setup.organizationId) {
      throw new Error(`Setup ${setupId} has no organizationId`);
    }
    const organizationId = setup.organizationId;

    await prisma.$transaction(async (tx) => {
      await tx.vehicleTireSetup.update({
        where: { id: setupId },
        data: anchorFields,
      });
      await tx.vehicleTireSetupMountPeriod.updateMany({
        where: { tireSetupId: setupId, removedAt: null },
        data: anchorFields,
      });
      await tx.tireEvent.create({
        data: {
          organizationId,
          vehicleId: setup.vehicleId,
          tireSetId: setupId,
          type: TireEventType.ODOMETER_ANCHOR_BACKFILLED,
          payload: {
            command: 'inferredInstallOdometer',
            operator,
            reason,
            setupId,
            vehicleId: setup.vehicleId,
            licensePlate: setup.vehicle.licensePlate,
            installedAt: installedAt.toISOString(),
            latestTelemetryOdometerKm: latestOdo,
            tripKmSinceInstall: tripKm,
            tripCountSinceInstall: tripAgg._count,
            inferredInstallOdometerKm: inferredInstallOdo,
            anchorFields,
          },
        },
      });
    });

    console.log(JSON.stringify({ ...payload, applied: true }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
