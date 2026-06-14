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

/**
 * PermissionsGuard — permission-based authorization on top of the existing
 * membership permission model (`OrganizationMembership.permissions` JSON).
 *
 * Resolution order (mirrors the frontend `hasPermission` semantics):
 *   1. No `@RequirePermission` on the route → pass-through.
 *   2. No authenticated user → defer (AuthGuard runs first globally).
 *   3. MASTER_ADMIN (platform role) → full access.
 *   4. ORG_ADMIN (membership role) → full access within the org.
 *   5. Everyone else → must have `{ [module]: { read|write: true } }` granted.
 *
 * This keeps feature code free of hardcoded role checks: routes only declare the
 * capability they need; the ORG_ADMIN grants that capability per employee.
 *
 * Must run AFTER OrgScopingGuard so the org membership is already validated.
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

    // No declared permission requirement → nothing to enforce here.
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // AuthGuard handles unauthenticated requests globally.
    if (!user) return true;

    // Platform admins bypass tenant permission checks.
    if (user.platformRole === 'MASTER_ADMIN') return true;

    // Org admins have full access within their organization.
    if (user.membershipRole === 'ORG_ADMIN') return true;

    const orgId: string | undefined = request.params?.orgId;
    if (!orgId) {
      // Permission-gated routes are always org-scoped in this codebase.
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

    const permissions = (membership.permissions ?? null) as Record<
      string,
      { read?: boolean; write?: boolean }
    > | null;

    const modulePerms = permissions?.[required.module];
    const granted =
      required.level === 'write' ? !!modulePerms?.write : !!modulePerms?.read;

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
