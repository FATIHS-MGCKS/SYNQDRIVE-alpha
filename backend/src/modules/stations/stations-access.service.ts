import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  evaluateStationsV2Permission,
  resolveStationsV2Permissions,
} from '@shared/auth/stations-v2-permission.util';
import {
  resolvePermissionOrgId,
  type PermissionActor,
} from '@shared/auth/permission.util';
import {
  isStationsV2PermissionAction,
  type StationsV2PermissionAction,
} from '@shared/auth/stations-v2-permission.constants';

export const StationsPermissionErrorCode = {
  AUTHENTICATION_REQUIRED: 'STATIONS_PERMISSION_AUTHENTICATION_REQUIRED',
  ORGANIZATION_CONTEXT_REQUIRED: 'STATIONS_PERMISSION_ORGANIZATION_CONTEXT_REQUIRED',
  UNKNOWN_PERMISSION: 'STATIONS_PERMISSION_UNKNOWN',
  MISSING_PERMISSION: 'STATIONS_PERMISSION_MISSING',
  MEMBERSHIP_REQUIRED: 'STATIONS_PERMISSION_MEMBERSHIP_REQUIRED',
  SET_PRIMARY_ROLE_FORBIDDEN: 'STATIONS_PERMISSION_SET_PRIMARY_ROLE_FORBIDDEN',
} as const;

export interface StationsOrgRequest {
  params?: { orgId?: string };
  query?: { orgId?: string | string[] };
}

@Injectable()
export class StationsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  resolveOrgId(request: StationsOrgRequest, actor: PermissionActor): string | undefined {
    return resolvePermissionOrgId(request, actor);
  }

  async assertStationsPermission(
    organizationId: string,
    actor: PermissionActor,
    action: StationsV2PermissionAction,
  ): Promise<void> {
    await this.assertStationsPermissions(organizationId, actor, [action]);
  }

  async assertStationsPermissions(
    organizationId: string,
    actor: PermissionActor,
    actions: StationsV2PermissionAction[],
  ): Promise<void> {
    for (const action of actions) {
      if (!isStationsV2PermissionAction(action)) {
        throw new ForbiddenException({
          statusCode: 403,
          code: StationsPermissionErrorCode.UNKNOWN_PERMISSION,
          message: `Unknown permission: ${action}`,
        });
      }
    }

    if (!actor.id) {
      throw new ForbiddenException({
        statusCode: 403,
        code: StationsPermissionErrorCode.AUTHENTICATION_REQUIRED,
        message: 'Authentication required',
      });
    }

    if (actor.platformRole === 'MASTER_ADMIN') {
      return;
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actor.id,
        organizationId,
        status: 'ACTIVE',
      },
      select: { permissions: true },
    });

    if (!membership) {
      throw new ForbiddenException({
        statusCode: 403,
        code: StationsPermissionErrorCode.MEMBERSHIP_REQUIRED,
        message: 'You do not have access to this organization',
      });
    }

    const resolved = resolveStationsV2Permissions(membership.permissions);
    for (const action of actions) {
      if (!evaluateStationsV2Permission(resolved, action)) {
        throw new ForbiddenException({
          statusCode: 403,
          code: StationsPermissionErrorCode.MISSING_PERMISSION,
          message: `Missing permission: ${action}`,
          permission: action,
        });
      }
    }
  }

  async assertStationsAccess(
    request: StationsOrgRequest,
    actor: PermissionActor,
    action: StationsV2PermissionAction,
  ): Promise<string> {
    return this.assertStationsAccessForActions(request, actor, [action]);
  }

  async assertStationsAccessForActions(
    request: StationsOrgRequest,
    actor: PermissionActor,
    actions: StationsV2PermissionAction[],
  ): Promise<string> {
    const orgId = this.resolveOrgId(request, actor);
    if (!orgId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: StationsPermissionErrorCode.ORGANIZATION_CONTEXT_REQUIRED,
        message: 'Organization context required',
      });
    }

    await this.assertStationsPermissions(orgId, actor, actions);
    return orgId;
  }

  async assertCanSetPrimary(organizationId: string, actor: PermissionActor): Promise<void> {
    await this.assertStationsPermission(organizationId, actor, 'stations.set_primary');

    if (!actor.id || actor.platformRole === 'MASTER_ADMIN') {
      return;
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actor.id,
        organizationId,
        status: 'ACTIVE',
      },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException({
        statusCode: 403,
        code: StationsPermissionErrorCode.MEMBERSHIP_REQUIRED,
        message: 'You do not have access to this organization',
      });
    }

    if (
      membership.role === MembershipRole.WORKER ||
      membership.role === MembershipRole.DRIVER
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: StationsPermissionErrorCode.SET_PRIMARY_ROLE_FORBIDDEN,
        message: 'Workers cannot change the organization primary station',
      });
    }
  }

  evaluateStationsPermission(
    permissionsRaw: unknown,
    action: StationsV2PermissionAction,
  ): boolean {
    return evaluateStationsV2Permission(resolveStationsV2Permissions(permissionsRaw), action);
  }
}
