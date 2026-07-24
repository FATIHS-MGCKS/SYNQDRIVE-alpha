import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import type { StationAccessContext } from '@shared/stations/station-access.types';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  resolvePermissionOrgId,
  type MembershipPermissionsMap,
  type PermissionActor,
} from '@shared/auth/permission.util';
import {
  EVALUATIONS_PERMISSION_LEGACY_FALLBACKS,
  EVALUATIONS_PERMISSION_REQUIREMENTS,
  type EvaluationsPermissionAction,
} from './evaluations-permission.constants';

export interface EvaluationsOrgRequest {
  params?: { orgId?: string };
  query?: { orgId?: string | string[]; stationId?: string | string[] };
}

@Injectable()
export class EvaluationsAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
  ) {}

  resolveOrgId(request: EvaluationsOrgRequest, actor: PermissionActor): string | undefined {
    return resolvePermissionOrgId(request, actor);
  }

  evaluateEvaluationsPermission(
    permissions: MembershipPermissionsMap | null,
    action: EvaluationsPermissionAction,
    options: {
      membershipRole?: MembershipRole | string;
      platformRole?: string | null;
    } = {},
  ): boolean {
    const permissionOptions = {
      membershipRole: options.membershipRole as MembershipRole | undefined,
      platformRole: options.platformRole,
    };
    const requirement = EVALUATIONS_PERMISSION_REQUIREMENTS[action];
    if (
      evaluateModulePermission(permissions, requirement.module, requirement.level, permissionOptions)
    ) {
      return true;
    }

    const fallbacks = EVALUATIONS_PERMISSION_LEGACY_FALLBACKS[action] ?? [];
    for (const fallback of fallbacks) {
      if (evaluateModulePermission(permissions, fallback.module, fallback.level, permissionOptions)) {
        return true;
      }
    }

    if (
      action === 'evaluations.customer_pii.read' &&
      evaluateModulePermission(permissions, 'invoices', 'read', permissionOptions) &&
      evaluateModulePermission(permissions, 'customers', 'read', permissionOptions)
    ) {
      return true;
    }

    if (
      action === 'evaluations.assignees.write' &&
      evaluateModulePermission(permissions, 'tasks', 'write', permissionOptions)
    ) {
      return true;
    }

    return false;
  }

  async assertEvaluationsPermission(
    organizationId: string,
    actor: PermissionActor,
    action: EvaluationsPermissionAction,
  ): Promise<MembershipPermissionsMap | null> {
    if (actor.platformRole === 'MASTER_ADMIN') {
      return null;
    }

    if (!actor.id) {
      throw new ForbiddenException('Authentication required');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actor.id,
        organizationId,
        status: 'ACTIVE',
      },
      select: {
        role: true,
        permissions: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    const permissions = normalizeMembershipPermissions(membership.permissions);
    const granted = this.evaluateEvaluationsPermission(permissions, action, {
      membershipRole: membership.role,
      platformRole: actor.platformRole,
    });

    if (!granted) {
      throw new ForbiddenException(`Missing permission: ${action}`);
    }

    return permissions;
  }

  async assertEvaluationsPermissionFromRequest(
    request: EvaluationsOrgRequest,
    actor: PermissionActor,
    action: EvaluationsPermissionAction,
  ): Promise<{ organizationId: string; permissions: MembershipPermissionsMap | null }> {
    const organizationId = this.resolveOrgId(request, actor);
    if (!organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    const permissions = await this.assertEvaluationsPermission(
      organizationId,
      actor,
      action,
    );

    return { organizationId, permissions };
  }

  async resolveStationAccess(
    userId: string | undefined,
    organizationId: string,
  ): Promise<StationAccessContext> {
    return this.stationAccess.resolve(userId, organizationId);
  }

  async assertReadableStation(
    userId: string | undefined,
    organizationId: string,
    stationId: string | undefined,
  ): Promise<StationAccessContext> {
    const access = await this.resolveStationAccess(userId, organizationId);
    if (!stationId) return access;

    try {
      this.stationAccess.assertStationReadable(access, stationId);
      return access;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new ForbiddenException('Access restricted by station scope');
    }
  }

  extractStationId(request: EvaluationsOrgRequest): string | undefined {
    const raw = request.query?.stationId;
    if (Array.isArray(raw)) return raw[0];
    return raw;
  }
}
