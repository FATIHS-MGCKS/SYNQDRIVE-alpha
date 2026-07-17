import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertStationsV2Permission,
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
    if (!isStationsV2PermissionAction(action)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: StationsPermissionErrorCode.UNKNOWN_PERMISSION,
        message: `Unknown permission: ${action}`,
      });
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

    await assertStationsV2Permission(this.prisma, actor, organizationId, action);
  }

  async assertStationsAccess(
    request: StationsOrgRequest,
    actor: PermissionActor,
    action: StationsV2PermissionAction,
  ): Promise<string> {
    const orgId = this.resolveOrgId(request, actor);
    if (!orgId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: StationsPermissionErrorCode.ORGANIZATION_CONTEXT_REQUIRED,
        message: 'Organization context required',
      });
    }

    await this.assertStationsPermission(orgId, actor, action);
    return orgId;
  }

  evaluateStationsPermission(
    permissionsRaw: unknown,
    action: StationsV2PermissionAction,
  ): boolean {
    return evaluateStationsV2Permission(resolveStationsV2Permissions(permissionsRaw), action);
  }
}
