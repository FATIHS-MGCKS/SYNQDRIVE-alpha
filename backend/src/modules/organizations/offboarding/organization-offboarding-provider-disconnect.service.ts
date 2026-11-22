import { Injectable, Optional } from '@nestjs/common';
import { VehicleProviderConsentStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { ProviderFinalizationState } from './organization-offboarding-execution.progress';
import { readProviderMockOutcome } from './organization-offboarding-provider-mock.policy';
import { OrganizationOffboardingDimoLiveDisconnectAdapter } from './organization-offboarding-dimo-live-disconnect.adapter';
import { OrganizationOffboardingHmLiveDisconnectAdapter } from './organization-offboarding-hm-live-disconnect.adapter';
import type { OrganizationProviderLiveEvidence } from './organization-offboarding-provider-live.types';
import {
  blocksExternalDisconnectConfirmation,
  mapLiveAdapterOutcomeForHistoricalDependency,
} from './organization-offboarding-provider-live.outcome';

export type ProviderExternalOutcome =
  | 'CONFIRMED'
  | 'NOT_AVAILABLE'
  | 'FAILED'
  | 'NO_DEPENDENCY'
  | 'REVIEW_REQUIRED';

export type ProviderDisconnectEvidenceSource = 'MOCK' | 'LIVE' | 'NONE';

export type ProviderDisconnectChannelResult = {
  provider: 'DIMO' | 'HIGH_MOBILITY';
  hadDependency: boolean;
  localRevoked: boolean;
  externalOutcome: ProviderExternalOutcome;
  evidenceSource: ProviderDisconnectEvidenceSource;
  detailCode: string | null;
  providerEvidence?: OrganizationProviderLiveEvidence;
};

export type OrganizationProviderDisconnectAssessment = {
  dimo: ProviderDisconnectChannelResult;
  hm: ProviderDisconnectChannelResult;
  finalizationState: ProviderFinalizationState;
  activeProviderConsentCount: number;
  connectedDimoVehicleCount: number;
  historicalProviderConsentCount: number;
  everHadDimoVehicleLink: boolean;
};

function isLiveExternalDisconnectEnabled(): boolean {
  return process.env.ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE === '1';
}

/**
 * Scoped org-level provider disconnect assessment — no live provider calls unless explicitly armed.
 * Local consent revocation is tracked separately from external disconnect confirmation (P6D4 policy).
 */
@Injectable()
export class OrganizationOffboardingProviderDisconnectService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly hmLive?: OrganizationOffboardingHmLiveDisconnectAdapter,
    @Optional() private readonly dimoLive?: OrganizationOffboardingDimoLiveDisconnectAdapter,
  ) {}

  async assessOrganization(organizationId: string): Promise<OrganizationProviderDisconnectAssessment> {
    const activeProviderConsentCount = await this.prisma.vehicleProviderConsent.count({
      where: { organizationId, status: VehicleProviderConsentStatus.ACTIVE },
    });
    const historicalProviderConsentCount = await this.prisma.vehicleProviderConsent.count({
      where: {
        organizationId,
        provider: { in: ['DIMO', 'HIGH_MOBILITY'] },
      },
    });
    const connectedDimoVehicleCount = await this.prisma.vehicle.count({
      where: {
        organizationId,
        dimoVehicle: { connectionStatus: 'CONNECTED' },
      },
    });
    const everHadDimoVehicleLink =
      (await this.prisma.vehicle.count({
        where: { organizationId, dimoVehicleId: { not: null } },
      })) > 0;

    const historicalDimoConsentCount = await this.prisma.vehicleProviderConsent.count({
      where: { organizationId, provider: 'DIMO' },
    });
    const historicalHmConsentCount = await this.prisma.vehicleProviderConsent.count({
      where: { organizationId, provider: 'HIGH_MOBILITY' },
    });

    const historicalHmDataSourceLinkCount = await this.prisma.vehicleDataSourceLink.count({
      where: {
        sourceType: 'HIGH_MOBILITY',
        vehicle: { organizationId },
      },
    });
    const orgVehicleIds = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const historicalHmVehicleBindingCount = await this.prisma.highMobilityVehicle.count({
      where: {
        OR: [
          { organizationId },
          ...(orgVehicleIds.length > 0
            ? [{ synqdriveVehicleId: { in: orgVehicleIds.map((v) => v.id) } }]
            : []),
        ],
      },
    });

    const dimoHad =
      historicalDimoConsentCount > 0 || everHadDimoVehicleLink || connectedDimoVehicleCount > 0;
    const hmHad =
      historicalHmConsentCount > 0 ||
      historicalHmDataSourceLinkCount > 0 ||
      historicalHmVehicleBindingCount > 0;

    const localRevoked = await this.performLocalQuiesce(organizationId);

    const postActiveProviderConsentCount = await this.prisma.vehicleProviderConsent.count({
      where: { organizationId, status: VehicleProviderConsentStatus.ACTIVE },
    });
    const postConnectedDimoVehicleCount = await this.prisma.vehicle.count({
      where: {
        organizationId,
        dimoVehicle: { connectionStatus: 'CONNECTED' },
      },
    });

    const dimo = await this.resolveChannel('DIMO', dimoHad, localRevoked.dimo, organizationId);
    const hm = await this.resolveChannel('HIGH_MOBILITY', hmHad, localRevoked.hm, organizationId);

    const finalizationState = this.deriveFinalizationState({
      dimo,
      hm,
      dimoHad,
      hmHad,
      activeProviderConsentCount: postActiveProviderConsentCount,
      connectedDimoVehicleCount: postConnectedDimoVehicleCount,
    });

    return {
      dimo,
      hm,
      finalizationState,
      activeProviderConsentCount: postActiveProviderConsentCount,
      connectedDimoVehicleCount: postConnectedDimoVehicleCount,
      historicalProviderConsentCount,
      everHadDimoVehicleLink,
    };
  }

  private async performLocalQuiesce(organizationId: string): Promise<{ dimo: boolean; hm: boolean }> {
    const now = new Date();
    const dimoUpdate = await this.prisma.vehicleProviderConsent.updateMany({
      where: {
        organizationId,
        provider: 'DIMO',
        status: VehicleProviderConsentStatus.ACTIVE,
      },
      data: {
        status: VehicleProviderConsentStatus.REVOKED,
        revokedAt: now,
      },
    });
    const hmUpdate = await this.prisma.vehicleProviderConsent.updateMany({
      where: {
        organizationId,
        provider: 'HIGH_MOBILITY',
        status: VehicleProviderConsentStatus.ACTIVE,
      },
      data: {
        status: VehicleProviderConsentStatus.REVOKED,
        revokedAt: now,
      },
    });
    await this.disconnectDimoVehiclesOrgExclusive(organizationId);
    return { dimo: dimoUpdate.count > 0, hm: hmUpdate.count > 0 };
  }

  /** Never mutate shared DimoVehicle connection when another tenant still references it. */
  private async disconnectDimoVehiclesOrgExclusive(organizationId: string): Promise<void> {
    const orgVehicles = await this.prisma.vehicle.findMany({
      where: { organizationId, dimoVehicleId: { not: null } },
      select: { dimoVehicleId: true },
    });
    const dimoIds = [...new Set(orgVehicles.map((v) => v.dimoVehicleId).filter((id): id is string => Boolean(id)))];
    for (const dimoVehicleId of dimoIds) {
      const foreignRefCount = await this.prisma.vehicle.count({
        where: {
          dimoVehicleId,
          organizationId: { not: organizationId },
        },
      });
      if (foreignRefCount > 0) {
        continue;
      }
      await this.prisma.dimoVehicle.updateMany({
        where: { id: dimoVehicleId, connectionStatus: 'CONNECTED' },
        data: { connectionStatus: 'DISCONNECTED' },
      });
    }
  }

  private async resolveChannel(
    provider: 'DIMO' | 'HIGH_MOBILITY',
    hadDependency: boolean,
    localRevoked: boolean,
    organizationId: string,
  ): Promise<ProviderDisconnectChannelResult> {
    if (!hadDependency) {
      return {
        provider,
        hadDependency: false,
        localRevoked: false,
        externalOutcome: 'NO_DEPENDENCY',
        evidenceSource: 'NONE',
        detailCode: null,
      };
    }

    const mock = readProviderMockOutcome(provider);
    if (mock) {
      return {
        provider,
        hadDependency: true,
        localRevoked,
        externalOutcome: mock === 'NO_DEPENDENCY' ? 'CONFIRMED' : mock,
        evidenceSource: 'MOCK',
        detailCode: mock === 'FAILED' ? `${provider}_EXTERNAL_REVOKE_FAILED` : null,
      };
    }

    if (!isLiveExternalDisconnectEnabled()) {
      return {
        provider,
        hadDependency: true,
        localRevoked,
        externalOutcome: 'NOT_AVAILABLE',
        evidenceSource: 'NONE',
        detailCode: `${provider}_EXTERNAL_REVOKE_NOT_AVAILABLE`,
      };
    }

    return this.resolveLiveChannel(provider, organizationId, hadDependency, localRevoked);
  }

  private async resolveLiveChannel(
    provider: 'DIMO' | 'HIGH_MOBILITY',
    organizationId: string,
    hadDependency: boolean,
    localRevoked: boolean,
  ): Promise<ProviderDisconnectChannelResult> {
    const base = {
      provider,
      hadDependency,
      localRevoked,
      evidenceSource: 'LIVE' as const,
    };

    if (provider === 'HIGH_MOBILITY') {
      if (!this.hmLive) {
        return {
          ...base,
          externalOutcome: 'NOT_AVAILABLE',
          detailCode: 'HM_EXTERNAL_REVOKE_LIVE_ADAPTER_UNAVAILABLE',
        };
      }
      const live = await this.hmLive.disconnectOrganization(organizationId);
      const externalOutcome = mapLiveAdapterOutcomeForHistoricalDependency(live.outcome, hadDependency);
      return {
        ...base,
        externalOutcome,
        detailCode: live.detailCode,
        providerEvidence: live.providerEvidence,
      };
    }

    if (!this.dimoLive) {
      return {
        ...base,
        externalOutcome: 'NOT_AVAILABLE',
        detailCode: 'DIMO_EXTERNAL_REVOKE_LIVE_ADAPTER_UNAVAILABLE',
      };
    }
    const live = await this.dimoLive.verifyOrganizationDisconnect(organizationId);
    const externalOutcome = mapLiveAdapterOutcomeForHistoricalDependency(live.outcome, hadDependency);
    return {
      ...base,
      externalOutcome,
      detailCode: live.detailCode,
      providerEvidence: live.providerEvidence,
    };
  }

  private deriveFinalizationState(input: {
    dimo: ProviderDisconnectChannelResult;
    hm: ProviderDisconnectChannelResult;
    dimoHad: boolean;
    hmHad: boolean;
    activeProviderConsentCount: number;
    connectedDimoVehicleCount: number;
  }): ProviderFinalizationState {
    if (!input.dimoHad && !input.hmHad) {
      return 'NO_EXTERNAL_PROVIDER_DEPENDENCY';
    }

    const channels = [input.dimo, input.hm].filter((c) => c.hadDependency);
    const allConfirmed = channels.every(
      (c) => c.externalOutcome === 'CONFIRMED' || c.externalOutcome === 'NO_DEPENDENCY',
    );
    if (allConfirmed && input.activeProviderConsentCount === 0 && input.connectedDimoVehicleCount === 0) {
      return 'EXTERNAL_DISCONNECT_CONFIRMED';
    }

    const anyFailed = channels.some((c) => blocksExternalDisconnectConfirmation(c.externalOutcome));
    if (anyFailed) {
      return 'EXTERNAL_DISCONNECT_PENDING';
    }

    return 'EXTERNAL_DISCONNECT_PENDING';
  }
}