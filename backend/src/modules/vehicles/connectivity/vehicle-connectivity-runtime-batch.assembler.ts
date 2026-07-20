/**
 * Pure batch assembly for canonical connectivity runtime state.
 * Shared by projection service (single + fleet batch read paths).
 */
import {
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import { bindingScopeMatches, buildCanonicalDeviceBinding } from '@modules/dimo/device-binding-lifecycle';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import {
  buildFleetDataCoverage,
  resolveFleetDeviceClass,
  resolveFleetPowertrainClass,
  resolveFleetProviderClass,
} from '../fleet-data-coverage';
import { resolveTelemetryFreshness as resolveCanonicalTelemetryFreshness } from '../telemetry-freshness.resolver';
import { assembleProviderLinkEvidence } from './domain/provider-link-evidence.assembler';
import { ProviderLinkStateBuilder } from './domain/provider-link-state.builder';
import type { VehicleConnectivityRuntimeState } from './domain/connectivity-domain.types';
import type { ProviderLinkStateResult } from './domain/provider-link-state.types';
import {
  ConnectivityDeviceType,
  ConnectivitySourceType,
  VehicleConnectivityRuntimeStateBuilder,
  type BuildVehicleConnectivityRuntimeStateInput,
} from './domain/vehicle-connectivity-runtime-state.builder';

export interface ConnectivityRuntimeVehicleRow {
  id: string;
  organizationId: string;
  hardwareType: string | null;
  fuelType: string | null;
  dimoVehicleId: string | null;
  dimoVehicle: {
    connectionStatus: string;
    tokenId: number | null;
    lastSignal: Date | null;
  } | null;
  latestState: {
    lastSeenAt: Date | null;
    providerFetchedAt: Date | null;
    sourceTimestamp: Date | null;
    providerSource: string | null;
    providerBindingId: string | null;
    rawPayloadJson: unknown;
    latitude: number | null;
    longitude: number | null;
    speedKmh: number | null;
    odometerKm: number | null;
    fuelLevelRelative: number | null;
    fuelLevelAbsolute: number | null;
    evSoc: number | null;
    obdDtcList: unknown;
    lastDtcPollAt: Date | null;
  } | null;
  dataSourceLinks: Array<{
    id: string;
    sourceType: string;
    sourceSubtype: string | null;
    isActive: boolean;
    provider: string;
  }>;
  providerConsents: Array<{
    organizationId: string;
    provider: string;
    status: string;
    grantedAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }>;
  deviceConnectionEpisodes: Array<{
    id: string;
    deviceBindingId: string | null;
    openedAt: Date;
    status: DeviceConnectionEpisodeStatus;
    resolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
    resolutionEvidenceAt: Date | null;
    resolvedAt: Date | null;
  }>;
}

export interface OrgAuthorizationRow {
  status: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ConnectivityRuntimeAssemblyResult {
  runtime: VehicleConnectivityRuntimeState;
  providerLink: ProviderLinkStateResult;
  bindingChangedSinceEpisode: boolean;
}

export function assembleVehicleConnectivityRuntimeBundle(
  vehicle: ConnectivityRuntimeVehicleRow,
  orgAuthorization: OrgAuthorizationRow | null,
  nowMs: number = Date.now(),
): ConnectivityRuntimeAssemblyResult {
  const providerEvidence = assembleProviderLinkEvidence({
    organizationId: vehicle.organizationId,
    vehicleId: vehicle.id,
    nowMs,
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

  const latestResolvedEpisode = [...vehicle.deviceConnectionEpisodes]
    .filter((episode) => episode.status === DeviceConnectionEpisodeStatus.RESOLVED)
    .sort((a, b) => {
      const aMs = a.resolutionEvidenceAt?.getTime() ?? a.resolvedAt?.getTime() ?? 0;
      const bMs = b.resolutionEvidenceAt?.getTime() ?? b.resolvedAt?.getTime() ?? 0;
      return bMs - aMs;
    })[0];
  const telemetryRecoveryAt =
    latestResolvedEpisode?.resolutionMethod ===
      DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED &&
    latestResolvedEpisode.resolutionEvidenceAt
      ? latestResolvedEpisode.resolutionEvidenceAt.toISOString()
      : null;
  const lastRecoveryEvidenceAt =
    latestResolvedEpisode?.resolutionEvidenceAt?.toISOString() ?? null;
  const lastRecoveryResolvedAt =
    latestResolvedEpisode?.resolvedAt?.toISOString() ?? null;
  const lastRecoveryReceivedAt: string | null = null;
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
    nowMs,
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
    nowMs,
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
      lastRecoveryEvidenceAt,
      lastRecoveryReceivedAt,
      lastRecoveryResolvedAt,
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

  return {
    runtime: VehicleConnectivityRuntimeStateBuilder.build(input),
    providerLink,
    bindingChangedSinceEpisode,
  };
}

export function assembleVehicleConnectivityRuntimeState(
  vehicle: ConnectivityRuntimeVehicleRow,
  orgAuthorization: OrgAuthorizationRow | null,
  nowMs: number = Date.now(),
): VehicleConnectivityRuntimeState {
  return assembleVehicleConnectivityRuntimeBundle(
    vehicle,
    orgAuthorization,
    nowMs,
  ).runtime;
}

export function assembleVehicleConnectivityRuntimeStates(
  vehicles: ConnectivityRuntimeVehicleRow[],
  orgAuthorization: OrgAuthorizationRow | null,
  nowMs: number = Date.now(),
): Map<string, VehicleConnectivityRuntimeState> {
  const result = new Map<string, VehicleConnectivityRuntimeState>();
  for (const vehicle of vehicles) {
    result.set(
      vehicle.id,
      assembleVehicleConnectivityRuntimeBundle(vehicle, orgAuthorization, nowMs)
        .runtime,
    );
  }
  return result;
}
