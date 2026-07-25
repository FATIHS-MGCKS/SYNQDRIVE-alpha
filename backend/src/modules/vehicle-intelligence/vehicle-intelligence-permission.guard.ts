import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
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
} from '@shared/auth/permission.util';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Vehicle intelligence routes: fleet.read for reads, fleet.write for mutations (VW-F-010).
 * Explicit @RequirePermission on a handler overrides this default.
 */
@Injectable()
export class VehicleIntelligencePermissionGuard implements CanActivate {
  private readonly logger = new Logger(VehicleIntelligencePermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const explicit = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const method = String(request.method ?? 'GET').toUpperCase();
    const required: RequiredPermission =
      explicit ??
      (READ_METHODS.has(method)
        ? { module: 'fleet', level: 'read' }
        : { module: 'fleet', level: 'write' });

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
        `VehicleIntelligencePermissionGuard: user ${user.id} missing ${required.module}.${required.level}`,
      );
      this.iamMetrics?.recordEffectiveAccessDenied(required.module, required.level);
      throw new ForbiddenException(
        `Missing permission: ${required.module}.${required.level}`,
      );
    }

    return true;
  }
}
