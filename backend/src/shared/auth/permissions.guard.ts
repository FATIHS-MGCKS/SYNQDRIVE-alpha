import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '@shared/decorators/require-permission.decorator';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  resolvePermissionOrgId,
} from './permission.util';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import {
  VehicleDetailAccessAuditAction,
  VehicleDetailAccessAuditService,
} from '@modules/activity-log/vehicle-detail-access-audit.service';

const VEHICLE_DETAIL_PERMISSION_MODULES = new Set([
  'fleet',
  'fleet-connectivity',
  'rental-rules',
  'rental-rules-overrides',
  'document-upload',
]);

/**
 * Permission-based authorization using `OrganizationMembership.permissions` JSON.
 *
 * Resolution order:
 *   1. No `@RequirePermission` → pass-through (route must still be auth + org scoped).
 *   2. Unauthenticated → deny.
 *   3. MASTER_ADMIN → allow.
 *   4. ORG_ADMIN membership → allow within org.
 *   5. Everyone else → explicit module permission required (never open-by-default).
 *
 * Must run AFTER OrgScopingGuard on org-scoped routes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
    @Optional() private readonly vehicleDetailAudit?: VehicleDetailAccessAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.platformRole === 'MASTER_ADMIN') return true;

    const orgId = resolvePermissionOrgId(request, user);
    if (!orgId) {
      throw new ForbiddenException('Organization context required');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.id, organizationId: orgId, status: 'ACTIVE' },
      select: { role: true, permissions: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    if (membership.role === 'ORG_ADMIN') return true;

    const permissions = normalizeMembershipPermissions(membership.permissions);
    const granted = evaluateModulePermission(
      permissions,
      required.module,
      required.level,
    );

    if (!granted) {
      this.logger.warn(
        `PermissionsGuard: user ${user.id} missing ${required.module}.${required.level} in org ${orgId}`,
      );
      this.iamMetrics?.recordEffectiveAccessDenied(required.module, required.level);
      this.recordVehicleDetailPermissionDenied(request, required, orgId, user.id);
      throw new ForbiddenException(
        `Missing permission: ${required.module}.${required.level}`,
      );
    }

    return true;
  }

  private recordVehicleDetailPermissionDenied(
    request: {
      params?: { vehicleId?: string; orgId?: string };
      method?: string;
      route?: { path?: string };
      url?: string;
      requestId?: string;
      ip?: string;
      connection?: { remoteAddress?: string };
      headers?: Record<string, string | string[] | undefined>;
    },
    required: RequiredPermission,
    organizationId: string,
    actorUserId: string,
  ): void {
    if (!this.vehicleDetailAudit) return;
    if (!this.isVehicleDetailPermissionContext(request, required)) return;

    this.vehicleDetailAudit.record({
      auditAction: VehicleDetailAccessAuditAction.PERMISSION_DENIED,
      organizationId,
      vehicleId: request.params?.vehicleId,
      actorUserId,
      purpose: `${required.module}.${required.level}`,
      route: request.route?.path
        ? `${request.method ?? 'GET'} ${request.route.path}`
        : undefined,
      requestId: request.requestId,
      ipAddress: request.ip ?? request.connection?.remoteAddress,
      userAgent: request.headers?.['user-agent'] as string | undefined,
      outcome: 'denied',
      errorClass: 'PERMISSION_DENIED',
      level: 'WARN',
      metadata: {
        requiredModule: required.module,
        requiredLevel: required.level,
      },
    });
  }

  private isVehicleDetailPermissionContext(
    request: { params?: { vehicleId?: string }; route?: { path?: string }; url?: string },
    required: RequiredPermission,
  ): boolean {
    if (request.params?.vehicleId) return true;
    const path = String(request.route?.path ?? request.url ?? '');
    if (path.includes('fleet-map') || path.includes('fleet-connectivity')) {
      return true;
    }
    return VEHICLE_DETAIL_PERMISSION_MODULES.has(required.module);
  }
}
