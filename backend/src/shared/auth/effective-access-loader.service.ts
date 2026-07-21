import { Injectable } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isStationsV2FeatureEnabled } from '@shared/stations/stations-v2-feature-flags.resolver';
import {
  computeEffectiveAccess,
  type EffectiveAccessInput,
  type EffectiveAccessResult,
} from '@modules/users/policies/effective-access-engine';

export type EffectiveAccessLoadOptions = {
  platformRole?: string | null;
  serviceAccount?: boolean;
  resourceOrganizationId?: string;
  stationId?: string;
};

type LoadedMembership = {
  id: string;
  organizationId: string;
  role: MembershipRole;
  status: MembershipStatus;
  permissions: unknown;
  stationScope: string | null;
  stationIds: unknown;
  fieldAgentAccess: boolean;
  membershipVersion: number;
  organizationRoleId: string | null;
  organizationRole?: {
    id: string;
    permissions: unknown;
    membershipRole: MembershipRole;
    stationScopeDefault: string | null;
    defaultStationIds: unknown;
    fieldAgentAccessDefault: boolean;
  } | null;
};

/**
 * DB adapter for EffectiveAccessEngine — loads membership + role template,
 * then delegates to the pure domain engine.
 */
@Injectable()
export class EffectiveAccessLoaderService {
  constructor(private readonly prisma: PrismaService) {}

  async loadForUserOrganization(
    userId: string,
    organizationId: string,
    options: EffectiveAccessLoadOptions = {},
  ): Promise<EffectiveAccessResult> {
    if (options.platformRole === 'MASTER_ADMIN') {
      return computeEffectiveAccess(
        this.buildMasterAdminInput(organizationId, options),
      );
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId },
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
        organizationRole: {
          select: {
            id: true,
            permissions: true,
            membershipRole: true,
            stationScopeDefault: true,
            defaultStationIds: true,
            fieldAgentAccessDefault: true,
          },
        },
      },
    });

    return computeEffectiveAccess(
      this.buildInputFromMembership(membership, organizationId, options),
    );
  }

  loadFromSnapshot(
    snapshot: {
      platformRole?: string | null;
      serviceAccount?: boolean;
      membership?: EffectiveAccessInput['membership'];
      organizationRole?: EffectiveAccessInput['organizationRole'];
      directPermissionOverrides?: unknown;
    },
    organizationId: string,
    options: EffectiveAccessLoadOptions = {},
  ): EffectiveAccessResult {
    return computeEffectiveAccess({
      platformRole: snapshot.platformRole,
      serviceAccount: snapshot.serviceAccount,
      membership: snapshot.membership,
      organizationRole: snapshot.organizationRole,
      directPermissionOverrides: snapshot.directPermissionOverrides,
      resourceContext: this.buildResourceContext(organizationId, options),
    });
  }

  buildInputFromMembership(
    membership: LoadedMembership | null,
    organizationId: string,
    options: EffectiveAccessLoadOptions = {},
  ): EffectiveAccessInput {
    if (!membership) {
      return {
        platformRole: options.platformRole,
        serviceAccount: options.serviceAccount,
        resourceContext: this.buildResourceContext(organizationId, options),
      };
    }

    return {
      platformRole: options.platformRole,
      serviceAccount: options.serviceAccount,
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
      organizationRole: membership.organizationRole
        ? {
            id: membership.organizationRole.id,
            permissions: membership.organizationRole.permissions,
            membershipRole: membership.organizationRole.membershipRole,
            stationScopeDefault: membership.organizationRole.stationScopeDefault,
            defaultStationIds: membership.organizationRole.defaultStationIds,
            fieldAgentAccessDefault:
              membership.organizationRole.fieldAgentAccessDefault,
          }
        : null,
      resourceContext: this.buildResourceContext(organizationId, options),
    };
  }

  private buildMasterAdminInput(
    organizationId: string,
    options: EffectiveAccessLoadOptions,
  ): EffectiveAccessInput {
    return {
      platformRole: 'MASTER_ADMIN',
      resourceContext: this.buildResourceContext(organizationId, options),
    };
  }

  private buildResourceContext(
    organizationId: string,
    options: EffectiveAccessLoadOptions,
  ): EffectiveAccessInput['resourceContext'] {
    return {
      organizationId: options.resourceOrganizationId ?? organizationId,
      stationId: options.stationId,
      stationsScopeV2Enabled: isStationsV2FeatureEnabled(
        organizationId,
        'stationsScopeV2Enabled',
      ),
    };
  }
}
