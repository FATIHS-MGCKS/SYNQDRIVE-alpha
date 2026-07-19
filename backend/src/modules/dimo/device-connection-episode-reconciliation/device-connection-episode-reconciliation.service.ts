/**
 * Read-only loader for device connection episode reconciliation audit.
 */
import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionEpisodeStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import { anonymizeVehicleId } from './device-connection-episode-reconciliation.anonymize';
import {
  buildReconciliationReport,
  reconcileVehicleEpisodes,
} from './device-connection-episode-reconciliation.engine';
import type {
  EpisodeReconciliationReport,
  ReconciliationEventInput,
  ReconciliationVehicleInput,
} from './device-connection-episode-reconciliation.types';

function extractProviderEventMeta(raw: unknown): {
  providerEventIdPresent: boolean;
  providerEventIdConflict: boolean;
} {
  if (!raw || typeof raw !== 'object') {
    return { providerEventIdPresent: false, providerEventIdConflict: false };
  }
  const record = raw as Record<string, unknown>;
  const ids = ['eventId', 'id', 'triggerId', 'messageId']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const unique = new Set(ids);
  return {
    providerEventIdPresent: ids.length > 0,
    providerEventIdConflict: unique.size > 1,
  };
}

@Injectable()
export class DeviceConnectionEpisodeReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async runReadOnlyAudit(opts?: {
    organizationId?: string;
    vehicleId?: string;
  }): Promise<EpisodeReconciliationReport> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
        ...(opts?.vehicleId ? { id: opts.vehicleId } : {}),
        OR: [
          { hardwareType: 'LTE_R1' },
          { dimoVehicleId: { not: null } },
          { dimoDeviceConnectionEvents: { some: {} } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        hardwareType: true,
        dimoVehicleId: true,
        dimoVehicle: {
          select: { tokenId: true, connectionStatus: true },
        },
        latestState: {
          select: {
            lastSeenAt: true,
            source: true,
            rawPayloadJson: true,
            dimoTokenId: true,
          },
        },
        dataSourceLinks: {
          select: {
            id: true,
            provider: true,
            sourceType: true,
            sourceSubtype: true,
            isActive: true,
            activatedAt: true,
            deactivatedAt: true,
            sourceReferenceId: true,
          },
          orderBy: { activatedAt: 'asc' },
        },
        deviceConnectionEpisodes: {
          where: { status: DeviceConnectionEpisodeStatus.OPEN },
          select: { id: true },
        },
      },
    });

    const vehicleIds = vehicles.map((v) => v.id);
    if (vehicleIds.length === 0) {
      return buildReconciliationReport({
        candidates: [],
        organizationScope: opts?.organizationId ?? null,
        vehicleScope: opts?.vehicleId ?? null,
      });
    }

    const [events, trips] = await Promise.all([
      this.prisma.dimoDeviceConnectionEvent.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
        },
        orderBy: { observedAt: 'asc' },
      }),
      this.prisma.vehicleTrip.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: { vehicleId: true, startTime: true },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    const eventsByVehicle = new Map<string, ReconciliationEventInput[]>();
    for (const event of events) {
      const meta = extractProviderEventMeta(event.rawPayloadJson);
      const list = eventsByVehicle.get(event.vehicleId) ?? [];
      list.push({
        id: event.id,
        eventType: event.eventType,
        observedAt: event.observedAt,
        receivedAt: event.createdAt,
        tokenId: event.tokenId,
        dedupBucket: event.dedupBucket,
        providerEventIdPresent: meta.providerEventIdPresent,
        providerEventIdConflict: meta.providerEventIdConflict,
      });
      eventsByVehicle.set(event.vehicleId, list);
    }

    const tripsByVehicle = new Map<string, Date[]>();
    for (const trip of trips) {
      const list = tripsByVehicle.get(trip.vehicleId) ?? [];
      list.push(trip.startTime);
      tripsByVehicle.set(trip.vehicleId, list);
    }

    const candidates = vehicles.flatMap((vehicle) => {
      const vehicleEvents = eventsByVehicle.get(vehicle.id) ?? [];
      if (vehicleEvents.length === 0) return [];

      const input = this.buildVehicleInput(vehicle, vehicleEvents, tripsByVehicle.get(vehicle.id) ?? []);
      return reconcileVehicleEpisodes(input);
    });

    return buildReconciliationReport({
      candidates,
      organizationScope: opts?.organizationId ?? null,
      vehicleScope: opts?.vehicleId ?? null,
    });
  }

  private buildVehicleInput(
    vehicle: {
      id: string;
      hardwareType: string;
      dimoVehicle: { tokenId: number | null; connectionStatus: string } | null;
      latestState: {
        lastSeenAt: Date | null;
        source: string;
        rawPayloadJson: unknown;
        dimoTokenId: number | null;
      } | null;
      dataSourceLinks: Array<{
        id: string;
        provider: string;
        sourceType: string;
        sourceSubtype: string | null;
        isActive: boolean;
        activatedAt: Date;
        deactivatedAt: Date | null;
        sourceReferenceId: string;
      }>;
      deviceConnectionEpisodes: Array<{ id: string }>;
    },
    events: ReconciliationEventInput[],
    tripStarts: Date[],
  ): ReconciliationVehicleInput {
    const raw = vehicle.latestState?.rawPayloadJson as Record<string, unknown> | null;
    const conn = extractConnectivitySnapshot(raw ?? undefined);
    const episodeTokenId =
      events.find((e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED)
        ?.tokenId ?? vehicle.dimoVehicle?.tokenId ?? null;
    const snapshotTokenId = vehicle.latestState?.dimoTokenId ?? vehicle.dimoVehicle?.tokenId ?? null;
    const sameBinding =
      episodeTokenId == null || snapshotTokenId == null
        ? null
        : episodeTokenId === snapshotTokenId;

    const lastUnplug = [...events]
      .filter((e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED)
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];

    const openedAt = lastUnplug?.observedAt ?? null;
    const tripsAfter = openedAt
      ? tripStarts.filter((t) => t.getTime() > openedAt.getTime())
      : [];
    const firstTelemetry =
      openedAt && vehicle.latestState?.lastSeenAt &&
      vehicle.latestState.lastSeenAt.getTime() > openedAt.getTime()
        ? vehicle.latestState.lastSeenAt
        : tripsAfter[0] ?? null;

    const sustained =
      openedAt != null &&
      firstTelemetry != null &&
      firstTelemetry.getTime() - openedAt.getTime() >= 5 * 60 * 1000;

    return {
      vehicleId: vehicle.id,
      anonymizedVehicleId: anonymizeVehicleId(vehicle.id),
      provider: 'DIMO',
      hardwareType: vehicle.hardwareType,
      dimoConnectionStatus: (vehicle.dimoVehicle?.connectionStatus as never) ?? null,
      bindings: vehicle.dataSourceLinks.map((link) => ({
        id: link.id,
        provider: link.provider,
        sourceType: link.sourceType,
        sourceSubtype: link.sourceSubtype,
        isActive: link.isActive,
        activatedAt: link.activatedAt,
        deactivatedAt: link.deactivatedAt,
        sourceReferenceId: link.sourceReferenceId,
      })),
      events,
      snapshot: {
        observedAt: vehicle.latestState?.lastSeenAt ?? null,
        receivedAt: vehicle.latestState?.lastSeenAt ?? null,
        source: vehicle.latestState?.source ?? null,
        obdIsPluggedIn: conn.obdIsPluggedIn,
        sameBindingAsEpisode: sameBinding,
      },
      telemetry: {
        firstAfterUnplugAt: firstTelemetry,
        lastSeenAt: vehicle.latestState?.lastSeenAt ?? null,
        sustainedAfterUnplug: sustained || tripsAfter.length >= 2,
      },
      trips: {
        firstTripStartAfterUnplug: tripsAfter[0] ?? null,
        tripCountAfterUnplug: tripsAfter.length,
      },
      alerts: {
        openDeviceUnplugAlert: false,
        openDeviceReconnectAlert: false,
      },
      persistedOpenEpisode: vehicle.deviceConnectionEpisodes.length > 0,
    };
  }
}
