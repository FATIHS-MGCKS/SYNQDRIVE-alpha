/**
 * Projects canonical connectivity runtime state after episode resolution.
 * Pure assembly over existing builder — no persistence table yet.
 */
import { Injectable } from '@nestjs/common';
import {
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import { bindingScopeMatches, buildCanonicalDeviceBinding } from '../device-binding-lifecycle';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import {
  ConnectivityDeviceType,
  ConnectivitySourceType,
  ProviderAuthorizationStatus,
  VehicleConnectivityRuntimeStateBuilder,
  type BuildVehicleConnectivityRuntimeStateInput,
} from '../../vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder';
import { DeviceConnectionWebhookConfigurationService } from '../device-connection-webhook-configuration/device-connection-webhook-configuration.service';
import type { VehicleConnectivityRuntimeState } from '@modules/vehicles/connectivity/domain/connectivity-domain.types';
import { WebhookConfigurationStateEnum } from '../device-connection-webhook-configuration/device-connection-webhook-configuration.types';

@Injectable()
export class VehicleConnectivityRuntimeProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookConfiguration: DeviceConnectionWebhookConfigurationService,
  ) {}

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

    const openEpisodeRaw =
      vehicle.deviceConnectionEpisodes.find(
        (episode) => episode.status === DeviceConnectionEpisodeStatus.OPEN,
      ) ?? null;
    const binding = vehicle.dataSourceLinks[0] ?? null;
    const bindingId = binding?.id ?? vehicle.latestState?.providerBindingId ?? null;
    const currentBinding = buildCanonicalDeviceBinding({
      provider: 'DIMO',
      dimoTokenId: vehicle.dimoVehicle?.tokenId ?? 0,
      hardwareType: vehicle.hardwareType,
      link: binding
        ? {
            id: binding.id,
            sourceType: binding.sourceType,
            sourceSubtype: binding.sourceSubtype,
            sourceReferenceId: binding.id,
            activatedAt: new Date(0),
            deactivatedAt: null,
          }
        : null,
    });
    const openEpisode =
      openEpisodeRaw &&
      bindingScopeMatches(
        {
          deviceBindingId: openEpisodeRaw.deviceBindingId,
          providerDeviceIdHash: null,
        },
        currentBinding,
      )
        ? openEpisodeRaw
        : null;
    const bindingChangedSinceEpisode =
      openEpisodeRaw != null &&
      openEpisode == null &&
      openEpisodeRaw.deviceBindingId != null &&
      bindingId != null &&
      openEpisodeRaw.deviceBindingId !== bindingId;

    const latestResolvedEpisode = vehicle.deviceConnectionEpisodes.find(
      (episode) => episode.status === DeviceConnectionEpisodeStatus.RESOLVED,
    );
    const telemetryRecoveryAt =
      latestResolvedEpisode?.resolutionMethod ===
        DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED &&
      latestResolvedEpisode.resolutionEvidenceAt
        ? latestResolvedEpisode.resolutionEvidenceAt.toISOString()
        : null;
    const raw = vehicle.latestState?.rawPayloadJson as Record<string, unknown> | null;
    const conn = extractConnectivitySnapshot(raw ?? undefined);

    const webhookConfig = await this.webhookConfiguration.getForVehicle({
      organizationId,
      vehicleId,
      hardwareType: vehicle.hardwareType,
      dimoLinked: vehicle.dimoVehicleId != null,
      tokenId: vehicle.dimoVehicle?.tokenId ?? null,
    });

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
        bindingChangedSinceEpisode,
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
        configured:
          webhookConfig.unplugTriggerState.state === WebhookConfigurationStateEnum.CONFIGURED,
        processingFailed: webhookConfig.unplugTriggerState.state === WebhookConfigurationStateEnum.ERROR,
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
