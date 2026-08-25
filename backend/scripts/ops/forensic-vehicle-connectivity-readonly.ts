/**
 * Read-only forensic connectivity projection for a single vehicle.
 * Usage (on VPS):
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/forensic-vehicle-connectivity-readonly.ts <vehicleId> <orgId>
 */
import { PrismaClient, DataAuthorizationSourceType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
  assembleVehicleConnectivityRuntimeBundle,
  type ConnectivityRuntimeVehicleRow,
} from '../../src/modules/vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler';
import {
  buildDeviceConnectionSummary,
  type DeviceConnectionEventRow,
} from '../../src/modules/dimo/device-connection-read-model';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main(): Promise<void> {
  const vehicleId = process.argv[2];
  const organizationId = process.argv[3];
  if (!vehicleId || !organizationId) {
    console.error('Usage: forensic-vehicle-connectivity-readonly.ts <vehicleId> <orgId>');
    process.exit(1);
  }

  loadEnv();
  const prisma = new PrismaClient();
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        licensePlate: true,
        hardwareType: true,
        fuelType: true,
        status: true,
        dimoVehicleId: true,
        dimoVehicle: {
          select: { connectionStatus: true, tokenId: true, lastSignal: true },
        },
        latestState: {
          select: {
            lastSeenAt: true,
            providerFetchedAt: true,
            sourceTimestamp: true,
            providerSource: true,
            providerBindingId: true,
            rawPayloadJson: true,
            latitude: true,
            longitude: true,
            speedKmh: true,
            odometerKm: true,
            fuelLevelRelative: true,
            fuelLevelAbsolute: true,
            evSoc: true,
            obdDtcList: true,
            lastDtcPollAt: true,
          },
        },
        dataSourceLinks: {
          where: { provider: 'DIMO' },
          orderBy: { activatedAt: 'desc' },
          select: {
            id: true,
            sourceType: true,
            sourceSubtype: true,
            isActive: true,
            provider: true,
          },
        },
        providerConsents: {
          where: { provider: 'DIMO' },
          orderBy: { grantedAt: 'desc' },
          select: {
            organizationId: true,
            provider: true,
            status: true,
            grantedAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        },
        deviceConnectionEpisodes: {
          orderBy: { openedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            deviceBindingId: true,
            openedAt: true,
            status: true,
            resolutionMethod: true,
            resolutionEvidenceAt: true,
            resolvedAt: true,
          },
        },
      },
    });

    if (!vehicle) {
      console.error('Vehicle not found');
      process.exit(1);
    }

    const orgAuth = await prisma.orgDataAuthorization.findFirst({
      where: {
        organizationId,
        sourceType: DataAuthorizationSourceType.DIMO,
        status: 'ACTIVE',
      },
      orderBy: { grantedAt: 'desc' },
      select: { status: true, expiresAt: true, revokedAt: true },
    });

    const allEvents = await prisma.dimoDeviceConnectionEvent.findMany({
      where: { organizationId, vehicleId },
      orderBy: { observedAt: 'asc' },
      select: {
        id: true,
        vehicleId: true,
        eventType: true,
        observedAt: true,
        receivedAt: true,
        processedAt: true,
      },
    });

    const events7d = allEvents.filter(
      (e) => e.observedAt.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000,
    );

    const bundle = assembleVehicleConnectivityRuntimeBundle(
      vehicle as ConnectivityRuntimeVehicleRow,
      orgAuth,
    );

    const readModelAll = buildDeviceConnectionSummary({
      vehicleId,
      hardwareType: vehicle.hardwareType,
      dimoLinked: vehicle.dimoVehicleId != null,
      nowMs: Date.now(),
      events: allEvents as DeviceConnectionEventRow[],
      bookings: [],
      trips: [],
      connectivityAnchor: {
        dimoConnectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
        obdIsPluggedIn:
          (vehicle.latestState?.rawPayloadJson as { obdIsPluggedIn?: { value?: boolean } })
            ?.obdIsPluggedIn?.value ?? null,
      },
      latestValidSnapshotAt: vehicle.latestState?.lastSeenAt ?? null,
      episodeEvidenceReliable: false,
    });

    const readModel7d = buildDeviceConnectionSummary({
      vehicleId,
      hardwareType: vehicle.hardwareType,
      dimoLinked: vehicle.dimoVehicleId != null,
      nowMs: Date.now(),
      events: events7d as DeviceConnectionEventRow[],
      bookings: [],
      trips: [],
      connectivityAnchor: {
        dimoConnectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
        obdIsPluggedIn:
          (vehicle.latestState?.rawPayloadJson as { obdIsPluggedIn?: { value?: boolean } })
            ?.obdIsPluggedIn?.value ?? null,
      },
      latestValidSnapshotAt: vehicle.latestState?.lastSeenAt ?? null,
      episodeEvidenceReliable: false,
    });

    console.log(
      JSON.stringify(
        {
          vehicle: {
            id: vehicle.id,
            licensePlate: vehicle.licensePlate,
            status: vehicle.status,
            tokenId: vehicle.dimoVehicle?.tokenId ?? null,
            connectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
            lastSignal: vehicle.dimoVehicle?.lastSignal?.toISOString() ?? null,
            latestSnapshotAt: vehicle.latestState?.lastSeenAt?.toISOString() ?? null,
            obdIsPluggedIn:
              (vehicle.latestState?.rawPayloadJson as { obdIsPluggedIn?: { value?: boolean } })
                ?.obdIsPluggedIn?.value ?? null,
          },
          eventCountAllTime: allEvents.length,
          eventCount7d: events7d.length,
          connectivityRuntime: bundle.runtime,
          readModelAllHistory: {
            openUnpluggedEpisode: readModelAll.openUnpluggedEpisode,
            currentDeviceConnectionStatus: readModelAll.currentDeviceConnectionStatus,
            lastDeviceUnpluggedAt: readModelAll.lastDeviceUnpluggedAt,
          },
          readModel7dWindow: {
            openUnpluggedEpisode: readModel7d.openUnpluggedEpisode,
            currentDeviceConnectionStatus: readModel7d.currentDeviceConnectionStatus,
            lastDeviceUnpluggedAt: readModel7d.lastDeviceUnpluggedAt,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
