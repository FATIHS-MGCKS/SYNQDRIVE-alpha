/**
 * Projects canonical connectivity runtime state after episode resolution.
 * Pure assembly over existing builder — no persistence table yet.
 */
import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import {
  ConnectivityDeviceType,
  ConnectivitySourceType,
  ProviderAuthorizationStatus,
  VehicleConnectivityRuntimeStateBuilder,
  type BuildVehicleConnectivityRuntimeStateInput,
} from '../../vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder';
import type { VehicleConnectivityRuntimeState } from '@modules/vehicles/connectivity/domain/connectivity-domain.types';

@Injectable()
export class VehicleConnectivityRuntimeProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  async projectForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleConnectivityRuntimeState> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        hardwareType: true,
        dimoVehicleId: true,
        dimoVehicle: { select: { connectionStatus: true, tokenId: true } },
        latestState: {
          select: {
            lastSeenAt: true,
            providerFetchedAt: true,
            sourceTimestamp: true,
            providerSource: true,
            providerBindingId: true,
            rawPayloadJson: true,
          },
        },
        dataSourceLinks: {
          where: { isActive: true, provider: 'DIMO' },
          orderBy: { activatedAt: 'desc' },
          take: 1,
          select: { id: true, sourceType: true, sourceSubtype: true },
        },
        deviceConnectionEpisodes: {
          where: { organizationId },
          orderBy: { openedAt: 'desc' },
          take: 2,
          select: {
            id: true,
            deviceBindingId: true,
            openedAt: true,
            status: true,
            resolutionMethod: true,
            resolutionEvidenceAt: true,
          },
        },
      },
    });

    if (!vehicle) {
      throw new Error(`Vehicle ${vehicleId} not found for connectivity projection`);
    }

    const openEpisode =
      vehicle.deviceConnectionEpisodes.find(
        (episode) => episode.status === DeviceConnectionEpisodeStatus.OPEN,
      ) ?? null;
    const latestResolvedEpisode = vehicle.deviceConnectionEpisodes.find(
      (episode) => episode.status === DeviceConnectionEpisodeStatus.RESOLVED,
    );
    const telemetryRecoveryAt =
      latestResolvedEpisode?.resolutionMethod ===
        DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED &&
      latestResolvedEpisode.resolutionEvidenceAt
        ? latestResolvedEpisode.resolutionEvidenceAt.toISOString()
        : null;
    const binding = vehicle.dataSourceLinks[0] ?? null;
    const raw = vehicle.latestState?.rawPayloadJson as Record<string, unknown> | null;
    const conn = extractConnectivitySnapshot(raw ?? undefined);
    const bindingId = binding?.id ?? vehicle.latestState?.providerBindingId ?? null;

    const input: BuildVehicleConnectivityRuntimeStateInput = {
      vehicleId: vehicle.id,
      organizationId: vehicle.organizationId,
      provider: {
        hasProviderLink: vehicle.dimoVehicleId != null,
        authorizationStatus: ProviderAuthorizationStatus.ACTIVE,
        consentGranted: vehicle.dimoVehicleId != null,
        providerConnectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
      },
      telemetry: {
        lastTelemetryAt: vehicle.latestState?.sourceTimestamp?.toISOString() ?? null,
        lastProviderObservedAt: vehicle.latestState?.sourceTimestamp?.toISOString() ?? null,
        lastReceivedAt: vehicle.latestState?.providerFetchedAt?.toISOString() ?? null,
      },
      binding: {
        deviceBindingId: bindingId,
        deviceType:
          vehicle.hardwareType === 'LTE_R1'
            ? ConnectivityDeviceType.PHYSICAL_OBD
            : ConnectivityDeviceType.OEM,
        sourceType: vehicle.dimoVehicleId
          ? ConnectivitySourceType.DIMO
          : ConnectivitySourceType.NONE,
        physicalObdCapable: vehicle.hardwareType === 'LTE_R1',
        bindingChangedSinceEpisode: false,
      },
      episode: {
        activeEpisodeId: openEpisode?.id ?? null,
        openUnpluggedEpisode: openEpisode != null,
        episodeBindingId: openEpisode?.deviceBindingId ?? null,
        lastUnplugWebhookAt: openEpisode?.openedAt.toISOString() ?? null,
        lastExplicitPlugWebhookAt: null,
        lastTelemetryRecoveryAt: openEpisode ? null : telemetryRecoveryAt,
      },
      snapshotPlug: {
        obdIsPluggedIn: conn.obdIsPluggedIn,
        observedAt: vehicle.latestState?.sourceTimestamp?.toISOString() ?? null,
        sameBindingAsEpisode:
          openEpisode?.deviceBindingId == null ||
          bindingId == null ||
          openEpisode.deviceBindingId === bindingId,
      },
      webhook: {
        configured: vehicle.dimoVehicleId != null,
        processingFailed: false,
        recentEventIds: [],
      },
      dataCoverage: {
        signalCoveragePercent: vehicle.latestState ? 80 : null,
        hasTelemetrySnapshot: vehicle.latestState != null,
      },
      processingErrors: {
        integrationError: false,
        webhookProcessingFailed: false,
      },
    };

    return VehicleConnectivityRuntimeStateBuilder.build(input);
  }
}
