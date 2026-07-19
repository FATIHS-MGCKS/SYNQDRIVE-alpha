/**
 * Projects canonical connectivity runtime state after episode resolution.
 * Pure assembly over existing builder — no persistence table yet.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DataAuthorizationSourceType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { VehicleConnectivityRuntimeState } from '../../vehicles/connectivity/domain/connectivity-domain.types';
import type { ProviderLinkStateResult } from '../../vehicles/connectivity/domain/provider-link-state.types';
import {
  assembleVehicleConnectivityRuntimeBundle,
  assembleVehicleConnectivityRuntimeStates,
  type ConnectivityRuntimeVehicleRow,
} from '../../vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler';
import { ConnectivityAlertService } from '../connectivity-alert/connectivity-alert.service';
import { ConnectivityObservabilityService } from '../connectivity/connectivity-observability.service';
import { DeviceConnectionWebhookConfigurationService } from '../device-connection-webhook-configuration/device-connection-webhook-configuration.service';
import { WebhookConfigurationStateEnum } from '../device-connection-webhook-configuration/device-connection-webhook-configuration.types';

const CONNECTIVITY_RUNTIME_VEHICLE_SELECT = {
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
    orderBy: { activatedAt: 'desc' as const },
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
    orderBy: { grantedAt: 'desc' as const },
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
    orderBy: { openedAt: 'desc' as const },
    take: 2,
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
} as const;

@Injectable()
export class VehicleConnectivityRuntimeProjectionService {
  private readonly logger = new Logger(VehicleConnectivityRuntimeProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly connectivityAlerts?: ConnectivityAlertService,
    @Optional() private readonly observability?: ConnectivityObservabilityService,
    @Optional()
    private readonly webhookConfiguration?: DeviceConnectionWebhookConfigurationService,
  ) {}

  async projectForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleConnectivityRuntimeState> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: CONNECTIVITY_RUNTIME_VEHICLE_SELECT,
    });

    if (!vehicle) {
      throw new Error(`Vehicle ${vehicleId} not found for connectivity projection`);
    }

    const orgAuthorization = await this.loadOrgAuthorization(organizationId);
    const bundle = assembleVehicleConnectivityRuntimeBundle(
      vehicle as ConnectivityRuntimeVehicleRow,
      orgAuthorization,
    );

    const runtime = await this.applyWebhookConfigurationEvidence(
      bundle.runtime,
      organizationId,
      vehicle,
    );

    await this.syncConnectivityAlerts({
      vehicle,
      providerLink: bundle.providerLink,
      canonicalTelemetryFreshness: runtime.telemetryState,
      dataCoverageState: runtime.dataCoverageState,
      bindingChangedSinceEpisode: bundle.bindingChangedSinceEpisode,
    });

    this.observability?.log('runtime_state_calculated', {
      overallState: runtime.overallState,
      telemetryState: runtime.telemetryState,
      providerLinkState: runtime.providerLinkState,
      physicalDeviceState: runtime.physicalDeviceState,
      coverageState: runtime.dataCoverageState,
      coverageRatio: runtime.evidence.signalCoveragePercent ?? undefined,
    });

    return runtime;
  }

  async projectForVehicles(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<Map<string, VehicleConnectivityRuntimeState>> {
    if (vehicleIds.length === 0) return new Map();

    const [vehicles, orgAuthorization] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { organizationId, id: { in: vehicleIds } },
        select: CONNECTIVITY_RUNTIME_VEHICLE_SELECT,
      }),
      this.loadOrgAuthorization(organizationId),
    ]);

    return assembleVehicleConnectivityRuntimeStates(
      vehicles as ConnectivityRuntimeVehicleRow[],
      orgAuthorization,
    );
  }

  private async applyWebhookConfigurationEvidence(
    runtime: VehicleConnectivityRuntimeState,
    organizationId: string,
    vehicle: {
      id: string;
      hardwareType: string | null;
      dimoVehicleId: string | null;
      dimoVehicle: { tokenId: number | null } | null;
    },
  ): Promise<VehicleConnectivityRuntimeState> {
    if (!this.webhookConfiguration) return runtime;

    const webhookConfig = await this.webhookConfiguration.getForVehicle({
      organizationId,
      vehicleId: vehicle.id,
      hardwareType: vehicle.hardwareType,
      dimoLinked: vehicle.dimoVehicleId != null,
      tokenId: vehicle.dimoVehicle?.tokenId ?? null,
    });

    const configured =
      webhookConfig.unplugTriggerState.state === WebhookConfigurationStateEnum.CONFIGURED;

    return {
      ...runtime,
      evidence: {
        ...runtime.evidence,
        webhookConfigured: configured,
      },
    };
  }

  private async loadOrgAuthorization(organizationId: string) {
    return this.prisma.orgDataAuthorization.findFirst({
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
  }

  private async syncConnectivityAlerts(input: {
    vehicle: {
      id: string;
      organizationId: string;
      make: string;
      model: string;
      licensePlate: string | null;
    };
    providerLink: ProviderLinkStateResult;
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
