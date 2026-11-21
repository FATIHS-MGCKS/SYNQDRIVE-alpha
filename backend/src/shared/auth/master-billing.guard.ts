import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  MASTER_BILLING_KEY,
  MASTER_BILLING_PLATFORM_PERMISSION,
} from '@shared/decorators/require-master-billing.decorator';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';

/**
 * Restricts routes to platform operators — not tenant org admins or workers.
 * Allows `MASTER_ADMIN` or an active canonical `master-billing` platform grant
 * (DB-authoritative for delegates — stale JWT claims do not bypass revocation).
 */
@Injectable()
export class MasterBillingGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformPermissions: PlatformPermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(MASTER_BILLING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.platformRole === 'MASTER_ADMIN') {
      return true;
    }

    const hasGrant = await this.platformPermissions.hasActiveMasterBillingGrant(user.id);
    if (!hasGrant) {
      throw new ForbiddenException('Master billing access required');
    }

    const platformPermissions: string[] = Array.isArray(user.platformPermissions)
      ? user.platformPermissions
      : [];
    if (!platformPermissions.includes(MASTER_BILLING_PLATFORM_PERMISSION)) {
      throw new ForbiddenException('Master billing access requires a refreshed access token');
    }

    return true;
  }
}