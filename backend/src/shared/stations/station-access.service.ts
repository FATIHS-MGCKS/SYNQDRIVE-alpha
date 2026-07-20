import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isStationsV2FeatureEnabled } from './stations-v2-feature-flags.resolver';
import { STATION_ACCESS_BYPASS, StationAccessContext } from './station-access.types';

@Injectable()
export class StationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string | undefined, organizationId: string): Promise<StationAccessContext> {
    if (!userId) return STATION_ACCESS_BYPASS;

    if (!isStationsV2FeatureEnabled(organizationId, 'stationsScopeV2Enabled')) {
      return { ...STATION_ACCESS_BYPASS, userId };
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId, status: 'ACTIVE' },
      select: { role: true, stationScope: true, stationIds: true },
    });

    if (!membership) {
      return { bypassScope: false, allowedStationIds: [], membershipRole: null, userId };
    }

    if (membership.role === MembershipRole.ORG_ADMIN) {
      return {
        bypassScope: true,
        allowedStationIds: null,
        membershipRole: membership.role,
        userId,
      };
    }

    const fromJson = this.parseStationIdsJson(membership.stationIds);
    if (fromJson.length > 0) {
      return {
        bypassScope: false,
        allowedStationIds: fromJson,
        membershipRole: membership.role,
        userId,
      };
    }

    const scope = membership.stationScope?.trim();
    if (!scope || scope === 'ALL') {
      return {
        bypassScope: true,
        allowedStationIds: null,
        membershipRole: membership.role,
        userId,
      };
    }

    if (
      membership.role === MembershipRole.SUB_ADMIN ||
      membership.role === MembershipRole.WORKER
    ) {
      return {
        bypassScope: false,
        allowedStationIds: [scope],
        membershipRole: membership.role,
        userId,
      };
    }

    return {
      bypassScope: true,
      allowedStationIds: null,
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

  /**
   * Restricts vehicle queries to stations the membership may see.
   * Matches when home or current station is in the allow-list.
   */
  buildVehicleStationScopeWhere(access: StationAccessContext): Prisma.VehicleWhereInput {
    if (access.bypassScope || access.allowedStationIds === null) return {};
    if (access.allowedStationIds.length === 0) {
      return { id: { in: [] } };
    }
    return {
      OR: [
        { homeStationId: { in: access.allowedStationIds } },
        { currentStationId: { in: access.allowedStationIds } },
      ],
    };
  }

  private parseStationIdsJson(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  }
}
