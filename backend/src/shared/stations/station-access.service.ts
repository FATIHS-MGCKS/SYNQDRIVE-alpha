import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { computeEffectiveAccess } from '@modules/users/policies/effective-access-engine';
import { isStationsV2FeatureEnabled } from './stations-v2-feature-flags.resolver';
import { STATION_ACCESS_BYPASS, StationAccessContext } from './station-access.types';

@Injectable()
export class StationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string | undefined, organizationId: string): Promise<StationAccessContext> {
    if (!userId) return STATION_ACCESS_BYPASS;

    const stationsScopeV2Enabled = isStationsV2FeatureEnabled(
      organizationId,
      'stationsScopeV2Enabled',
    );

    if (!stationsScopeV2Enabled) {
      return { ...STATION_ACCESS_BYPASS, userId };
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId, status: 'ACTIVE' },
      select: {
        id: true,
        organizationId: true,
        role: true,
        status: true,
        permissions: true,
        stationScope: true,
        stationIds: true,
        fieldAgentAccess: true,
        membershipVersion: true,
        organizationRoleId: true,
      },
    });

    if (!membership) {
      return { bypassScope: false, allowedStationIds: [], membershipRole: null, userId };
    }

    const access = computeEffectiveAccess({
      membership: {
        id: membership.id,
        organizationId: membership.organizationId,
        role: membership.role,
        status: membership.status,
        permissions: membership.permissions,
        stationScope: membership.stationScope,
        stationIds: membership.stationIds,
        fieldAgentAccess: membership.fieldAgentAccess,
        membershipVersion: membership.membershipVersion,
        organizationRoleId: membership.organizationRoleId,
      },
      resourceContext: {
        organizationId,
        stationsScopeV2Enabled,
      },
    });

    return {
      bypassScope: access.stationBypass,
      allowedStationIds: access.effectiveStationIds,
      membershipRole: membership.role,
      userId,
    };
  }

  buildStationWhere(
    organizationId: string,
    access: StationAccessContext,
  ): Prisma.StationWhereInput {
    const base: Prisma.StationWhereInput = { organizationId };
    if (access.bypassScope || access.allowedStationIds === null) return base;
    return { ...base, id: { in: access.allowedStationIds } };
  }

  assertStationReadable(access: StationAccessContext, stationId: string): void {
    if (access.bypassScope || access.allowedStationIds === null) return;
    if (!access.allowedStationIds.includes(stationId)) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }
  }
}
