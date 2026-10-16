import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type {
  VsiCapabilityResolverLinkContext,
  VsiCapabilityResolverProfileContext,
} from './vsi-capability-resolver.types';
import {
  VSI_APDS_MAX_VEHICLE_SOURCE_LINKS_HISTORICAL_ATTRIBUTION,
  type VsiApdsVehicleSourceLinkLifecycleRow,
} from './vsi-apds-historical-link-uniqueness';

@Injectable()
export class VsiCapabilityResolverRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadLinkContext(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
  }): Promise<VsiCapabilityResolverLinkContext | null> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: { id: input.providerSourceLinkId, vehicleId: input.vehicleId },
      select: {
        id: true,
        vehicleId: true,
        isActive: true,
        activatedAt: true,
        deactivatedAt: true,
        supersededByLinkId: true,
        vehicle: { select: { organizationId: true } },
      },
    });
    if (!link) {
      return null;
    }
    const superseded = link.supersededByLinkId != null;
    return {
      id: link.id,
      vehicleId: link.vehicleId,
      isActive: link.isActive && !superseded,
      activatedAt: link.activatedAt,
      deactivatedAt: link.deactivatedAt,
      supersededAt: superseded ? link.deactivatedAt : null,
      organizationId: link.vehicle.organizationId,
    };
  }

  async countActiveSourceLinks(vehicleId: string): Promise<number> {
    return this.prisma.vehicleDataSourceLink.count({
      where: { vehicleId, isActive: true },
    });
  }

  /**
   * All provider-source links for historical attribution at a decision timestamp (not `isActive` filtered).
   */
  async listVehicleSourceLinksForHistoricalAttribution(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<{
    links: VsiApdsVehicleSourceLinkLifecycleRow[];
    rowLimitExceeded: boolean;
  }> {
    const cap = VSI_APDS_MAX_VEHICLE_SOURCE_LINKS_HISTORICAL_ATTRIBUTION;
    const rows = await this.prisma.vehicleDataSourceLink.findMany({
      where: {
        vehicleId: input.vehicleId,
        vehicle: { organizationId: input.organizationId },
      },
      select: {
        id: true,
        activatedAt: true,
        deactivatedAt: true,
        supersededByLinkId: true,
      },
      orderBy: { activatedAt: 'asc' },
      take: cap + 1,
    });
    const rowLimitExceeded = rows.length > cap;
    const links = rowLimitExceeded ? rows.slice(0, cap) : rows;
    return { links, rowLimitExceeded };
  }

  async loadProfileContext(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
  }): Promise<VsiCapabilityResolverProfileContext | null> {
    const bundle = await this.loadProfileContextWithTemporal(input);
    return bundle?.profile ?? null;
  }

  async loadProfileContextWithTemporal(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
  }): Promise<{
    profile: VsiCapabilityResolverProfileContext;
    temporal: {
      evaluatedAt: Date;
      createdAt: Date;
      updatedAt: Date;
      profileRevision: number;
    };
    trustedProviderIdentity: string;
    trustedVerifiedModality: string | null;
    trustedTelemetrySourceFamily: string | null;
  } | null> {
    const row = await this.prisma.vehicleSignalCapabilityProfile.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      },
      select: {
        profileContractVersion: true,
        profileRevision: true,
        contentFingerprint: true,
        profileLimitations: true,
        signalsSnapshot: true,
        evaluatedAt: true,
        createdAt: true,
        updatedAt: true,
        providerIdentity: true,
        verifiedModality: true,
        telemetrySourceFamily: true,
      },
    });
    if (!row) {
      return null;
    }
    const limitations = Array.isArray(row.profileLimitations)
      ? (row.profileLimitations as string[])
      : [];
    const signalsRaw = row.signalsSnapshot;
    const signals = Array.isArray(signalsRaw)
      ? (signalsRaw as VsiCapabilityResolverProfileContext['signals'])
      : [];

    const profile: VsiCapabilityResolverProfileContext = {
      profileContractVersion: row.profileContractVersion,
      profileRevision: row.profileRevision,
      contentFingerprint: row.contentFingerprint,
      profileLimitations: limitations,
      signals,
    };
    return {
      profile,
      temporal: {
        evaluatedAt: row.evaluatedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        profileRevision: row.profileRevision,
      },
      trustedProviderIdentity: row.providerIdentity,
      trustedVerifiedModality: row.verifiedModality,
      trustedTelemetrySourceFamily: row.telemetrySourceFamily,
    };
  }

  async loadPersistedApdsShadowDecision(input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    policyVersion: string;
  }) {
    return this.prisma.apdShadowReconciliationDecision.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        opportunityId: input.opportunityId,
        policyVersion: input.policyVersion,
      },
      select: {
        organizationId: true,
        vehicleId: true,
        opportunityId: true,
        decisionAt: true,
        policyVersion: true,
        activationEpochId: true,
        decision: true,
      },
    });
  }
}
