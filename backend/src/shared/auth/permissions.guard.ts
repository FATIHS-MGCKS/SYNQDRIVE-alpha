import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
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
      throw new ForbiddenException(
        `Missing permission: ${required.module}.${required.level}`,
      );
    }

    return true;
  }
}
