import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type {
  VsiCapabilityResolverLinkContext,
  VsiCapabilityResolverProfileContext,
} from './vsi-capability-resolver.types';

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
      supersededAt: superseded ? link.deactivatedAt : null,
      organizationId: link.vehicle.organizationId,
    };
  }

  async countActiveSourceLinks(vehicleId: string): Promise<number> {
    return this.prisma.vehicleDataSourceLink.count({
      where: { vehicleId, isActive: true },
    });
  }

  async loadProfileContext(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
  }): Promise<VsiCapabilityResolverProfileContext | null> {
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

    return {
      profileContractVersion: row.profileContractVersion,
      profileRevision: row.profileRevision,
      contentFingerprint: row.contentFingerprint,
      profileLimitations: limitations,
      signals,
    };
  }
}
