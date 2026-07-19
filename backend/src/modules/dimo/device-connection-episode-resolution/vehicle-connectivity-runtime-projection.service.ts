/**
 * Projects canonical connectivity runtime state after episode resolution.
 * Pure assembly over existing builder — no persistence table yet.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DataAuthorizationSourceType,
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import { bindingScopeMatches, buildCanonicalDeviceBinding } from '../device-binding-lifecycle';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import {
  ConnectivityDeviceType,
  ConnectivitySourceType,
  VehicleConnectivityRuntimeStateBuilder,
  type BuildVehicleConnectivityRuntimeStateInput,
} from '../../vehicles/connectivity/domain/vehicle-connectivity-runtime-state.builder';
import {
  assembleProviderLinkEvidence,
} from '../../vehicles/connectivity/domain/provider-link-evidence.assembler';
import { ProviderLinkStateBuilder } from '../../vehicles/connectivity/domain/provider-link-state.builder';
import type { VehicleConnectivityRuntimeState } from '@modules/vehicles/connectivity/domain/connectivity-domain.types';
import { resolveTelemetryFreshness as resolveCanonicalTelemetryFreshness } from '../../vehicles/telemetry-freshness.resolver';
import {
  buildFleetDataCoverage,
  resolveFleetDeviceClass,
  resolveFleetPowertrainClass,
  resolveFleetProviderClass,
} from '../../vehicles/fleet-data-coverage';
import { ConnectivityAlertService } from '../connectivity-alert/connectivity-alert.service';

@Injectable()
export class VehicleConnectivityRuntimeProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly connectivityAlerts?: ConnectivityAlertService,
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
        fuelType: true,
        make: true,
        model: true,
        licensePlate: true,
        dimoVehicleId: true,
        dimoVehicle: { select: { connectionStatus: true, tokenId: true, lastSignal: true } },
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

    const orgAuthorization = await this.prisma.orgDataAuthorization.findFirst({
      where: {
        organizationId,
        sourceType: DataAuthorizationSourceType.DIMO,
        status: 'ACTIVE',
      },
      orderBy: { grantedAt: 'desc' },
      select: {
        status: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    const providerEvidence = assembleProviderLinkEvidence({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      dimoVehicleId: vehicle.dimoVehicleId,
      dimoVehicle: vehicle.dimoVehicle,
      dataSourceLinks: vehicle.dataSourceLinks.map((link) => ({
        id: link.id,
        provider: link.provider,
        isActive: link.isActive,
        organizationId: vehicle.organizationId,
      })),
      providerConsents: vehicle.providerConsents,
      orgAuthorization,
      lastSuccessfulTelemetryAt:
        vehicle.latestState?.sourceTimestamp ?? vehicle.latestState?.lastSeenAt ?? null,
    });
    const providerLink = ProviderLinkStateBuilder.build(providerEvidence);

    const openEpisodeRaw =
      vehicle.deviceConnectionEpisodes.find(
        (episode) => episode.status === DeviceConnectionEpisodeStatus.OPEN,
      ) ?? null;
    const binding =
      vehicle.dataSourceLinks.find((link) => link.isActive && link.provider === 'DIMO') ??
      null;
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

    const canonicalTelemetry = resolveCanonicalTelemetryFreshness(
      {
        providerObservedAt: vehicle.latestState?.sourceTimestamp ?? null,
        lastValidTelemetryAt:
          vehicle.latestState?.sourceTimestamp ?? vehicle.latestState?.lastSeenAt ?? null,
        receivedAt: vehicle.latestState?.providerFetchedAt ?? null,
        lastSignal: vehicle.dimoVehicle?.lastSignal ?? null,
        latestStateUpdatedAt: vehicle.latestState?.lastSeenAt ?? null,
      },
    );

    const hasProviderLink = providerLink.hasProviderLink;
    const hasAftermarket = vehicle.hardwareType === 'LTE_R1';
    const deviceClass = resolveFleetDeviceClass({
      hardwareType: vehicle.hardwareType,
      hasAftermarketDevice: hasAftermarket,
      hasSyntheticDevice: false,
      hasProviderLink,
    });
    const dataCoverageResult = buildFleetDataCoverage({
      context: {
        provider: resolveFleetProviderClass(
          hasProviderLink,
          vehicle.latestState?.providerSource,
        ),
        deviceClass,
        powertrain: resolveFleetPowertrainClass(vehicle.fuelType),
        physicalObdCapable: vehicle.hardwareType === 'LTE_R1',
        hasProviderLink,
        hasTelemetrySnapshot: vehicle.latestState != null,
      },
      observation: {
        latitude: vehicle.latestState?.latitude,
        longitude: vehicle.latestState?.longitude,
        odometerKm: vehicle.latestState?.odometerKm,
        speedKmh: vehicle.latestState?.speedKmh,
        fuelLevelRelative: vehicle.latestState?.fuelLevelRelative,
        fuelLevelAbsolute: vehicle.latestState?.fuelLevelAbsolute,
        evSoc: vehicle.latestState?.evSoc,
        obdDtcList: vehicle.latestState?.obdDtcList,
        lastDtcPollAt: vehicle.latestState?.lastDtcPollAt,
        obdIsPluggedIn: conn.obdIsPluggedIn,
        jammingDetectedCount: conn.jammingDetectedCount,
        hasTelemetry: vehicle.latestState != null,
        rawSignals: raw,
      },
      telemetryFreshness: canonicalTelemetry.freshness,
    });

    const input: BuildVehicleConnectivityRuntimeStateInput = {
      vehicleId: vehicle.id,
      organizationId: vehicle.organizationId,
      provider: { link: providerLink },
      telemetry: {
        lastTelemetryAt: canonicalTelemetry.observedAtIso,
        lastProviderObservedAt: canonicalTelemetry.observedAtIso,
        lastReceivedAt: vehicle.latestState?.providerFetchedAt?.toISOString() ?? null,
      },
      binding: {
        deviceBindingId: bindingId,
        deviceType:
          vehicle.hardwareType === 'LTE_R1'
            ? ConnectivityDeviceType.PHYSICAL_OBD
            : ConnectivityDeviceType.OEM,
        sourceType: providerLink.hasProviderLink
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
        observedAt: canonicalTelemetry.observedAtIso,
        sameBindingAsEpisode:
          openEpisode?.deviceBindingId == null ||
          bindingId == null ||
          openEpisode.deviceBindingId === bindingId,
      },
      webhook: {
        configured: providerLink.hasProviderLink,
        processingFailed: providerLink.state === 'ERROR',
        recentEventIds: [],
      },
      dataCoverage: {
        signalCoveragePercent: dataCoverageResult.coveragePercent,
        hasTelemetrySnapshot: vehicle.latestState != null,
      },
      processingErrors: {
        integrationError: providerLink.state === 'ERROR',
        webhookProcessingFailed: false,
      },
    };

    const runtimeState = VehicleConnectivityRuntimeStateBuilder.build(input);

    await this.syncConnectivityAlerts({
      vehicle,
      providerLink,
      canonicalTelemetryFreshness: canonicalTelemetry.freshness,
      dataCoverageState: dataCoverageResult.coverageState,
      bindingChangedSinceEpisode,
    });

    return runtimeState;
  }

  private async syncConnectivityAlerts(input: {
    vehicle: {
      id: string;
      organizationId: string;
      make: string;
      model: string;
      licensePlate: string | null;
    };
    providerLink: ReturnType<typeof ProviderLinkStateBuilder.build>;
    canonicalTelemetryFreshness: string;
    dataCoverageState: string;
    bindingChangedSinceEpisode: boolean;
  }): Promise<void> {
    if (!this.connectivityAlerts) return;

    const label =
      [input.vehicle.make, input.vehicle.model].filter(Boolean).join(' ').trim() ||
      input.vehicle.id;

    await this.connectivityAlerts.syncRuntimeAlerts({
      organizationId: input.vehicle.organizationId,
      vehicleId: input.vehicle.id,
      provider: 'DIMO',
      label,
      licensePlate: input.vehicle.licensePlate,
      telemetryFreshness: input.canonicalTelemetryFreshness as
        | 'live'
        | 'standby'
        | 'signal_delayed'
        | 'offline'
        | 'no_signal',
      providerLinkState: input.providerLink.state,
      hasProviderLink: input.providerLink.hasProviderLink,
      coverageState: input.dataCoverageState as
        | 'GOOD'
        | 'PARTIAL'
        | 'INSUFFICIENT'
        | 'UNKNOWN'
        | 'NOT_APPLICABLE',
      webhookProcessingFailed: input.providerLink.state === 'ERROR',
      bindingChanged: input.bindingChangedSinceEpisode,
      connectivityStateUnknown: input.providerLink.state === 'UNKNOWN',
      observedAt: new Date(),
    });
  }
}
