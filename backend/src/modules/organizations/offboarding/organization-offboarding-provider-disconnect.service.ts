import { Injectable } from '@nestjs/common';
import { VehicleProviderConsentStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { ProviderFinalizationState } from './organization-offboarding-execution.progress';

export type ProviderExternalOutcome =
  | 'CONFIRMED'
  | 'NOT_AVAILABLE'
  | 'FAILED'
  | 'NO_DEPENDENCY';

export type ProviderDisconnectChannelResult = {
  provider: 'DIMO' | 'HIGH_MOBILITY';
  hadDependency: boolean;
  localRevoked: boolean;
  externalOutcome: ProviderExternalOutcome;
  detailCode: string | null;
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

function readMockOutcome(provider: 'DIMO' | 'HIGH_MOBILITY'): ProviderExternalOutcome | null {
  const key =
    provider === 'DIMO'
      ? process.env.ORGANIZATION_OFFBOARDING_MOCK_DIMO_EXTERNAL
      : process.env.ORGANIZATION_OFFBOARDING_MOCK_HM_EXTERNAL;
  if (!key) return null;
  const normalized = key.trim().toUpperCase();
  if (
    normalized === 'CONFIRMED' ||
    normalized === 'NOT_AVAILABLE' ||
    normalized === 'FAILED' ||
    normalized === 'NO_DEPENDENCY'
  ) {
    return normalized;
  }
  return null;
}

function isLiveExternalDisconnectEnabled(): boolean {
  return process.env.ORGANIZATION_OFFBOARDING_PROVIDER_DISCONNECT_LIVE === '1';
}

/**
 * Scoped org-level provider disconnect assessment — no live provider calls unless explicitly armed.
 * Local consent revocation is tracked separately from external disconnect confirmation (P6D4 policy).
 */
@Injectable()
export class OrganizationOffboardingProviderDisconnectService {
  constructor(private readonly prisma: PrismaService) {}

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

    const dimoHad =
      historicalDimoConsentCount > 0 || everHadDimoVehicleLink || connectedDimoVehicleCount > 0;
    const hmHad = historicalHmConsentCount > 0;

    const localRevoked = await this.performLocalQuiesce(organizationId);

    const dimo = await this.resolveChannel('DIMO', dimoHad, localRevoked.dimo);
    const hm = await this.resolveChannel('HIGH_MOBILITY', hmHad, localRevoked.hm);

    const finalizationState = this.deriveFinalizationState({
      dimo,
      hm,
      dimoHad,
      hmHad,
      activeProviderConsentCount,
      connectedDimoVehicleCount,
    });

    return {
      dimo,
      hm,
      finalizationState,
      activeProviderConsentCount,
      connectedDimoVehicleCount,
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
    await this.prisma.dimoVehicle.updateMany({
      where: {
        registeredVehicles: { some: { organizationId } },
        connectionStatus: 'CONNECTED',
      },
      data: { connectionStatus: 'DISCONNECTED' },
    });
    return { dimo: dimoUpdate.count > 0, hm: hmUpdate.count > 0 };
  }

  private async resolveChannel(
    provider: 'DIMO' | 'HIGH_MOBILITY',
    hadDependency: boolean,
    localRevoked: boolean,
  ): Promise<ProviderDisconnectChannelResult> {
    if (!hadDependency) {
      return {
        provider,
        hadDependency: false,
        localRevoked: false,
        externalOutcome: 'NO_DEPENDENCY',
        detailCode: null,
      };
    }

    const mock = readMockOutcome(provider);
    if (mock) {
      return {
        provider,
        hadDependency: true,
        localRevoked,
        externalOutcome: mock === 'NO_DEPENDENCY' ? 'CONFIRMED' : mock,
        detailCode: mock === 'FAILED' ? `${provider}_EXTERNAL_REVOKE_FAILED` : null,
      };
    }

    if (!isLiveExternalDisconnectEnabled()) {
      return {
        provider,
        hadDependency: true,
        localRevoked,
        externalOutcome: 'NOT_AVAILABLE',
        detailCode: `${provider}_EXTERNAL_REVOKE_NOT_AVAILABLE`,
      };
    }

    return {
      provider,
      hadDependency: true,
      localRevoked,
      externalOutcome: 'NOT_AVAILABLE',
      detailCode: `${provider}_EXTERNAL_REVOKE_LIVE_PATH_NOT_IMPLEMENTED`,
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

    const anyFailed = channels.some(
      (c) => c.externalOutcome === 'FAILED' || c.externalOutcome === 'NOT_AVAILABLE',
    );
    if (anyFailed) {
      return 'EXTERNAL_DISCONNECT_PENDING';
    }

    return 'EXTERNAL_DISCONNECT_PENDING';
  }
}