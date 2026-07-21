import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from '@shared/decorators/require-permission.decorator';
import { isModuleAccessAllowed } from '@modules/users/policies/effective-access-engine';
import { EffectiveAccessLoaderService } from './effective-access-loader.service';
import { resolvePermissionOrgId } from './permission.util';

/**
 * Permission-based authorization using the canonical EffectiveAccessEngine.
 *
 * Resolution order (centralized in engine — do not duplicate in controllers):
 *   1. No `@RequirePermission` → pass-through (route must still be auth + org scoped).
 *   2. Unauthenticated → deny.
 *   3. MASTER_ADMIN → allow (engine bypass).
 *   4. ACTIVE ORG_ADMIN membership → allow within org (engine bypass).
 *   5. Everyone else → explicit module permission required (default deny).
 *
 * Must run AFTER OrgScopingGuard on org-scoped routes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly effectiveAccessLoader: EffectiveAccessLoaderService,
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

    const access = await this.effectiveAccessLoader.loadForUserOrganization(
      user.id,
      orgId,
      { platformRole: user.platformRole },
    );

    if (!access.membershipActive && access.roleSource !== 'ORG_ADMIN') {
      throw new ForbiddenException('You do not have access to this organization');
    }

    const granted = isModuleAccessAllowed(
      access,
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
