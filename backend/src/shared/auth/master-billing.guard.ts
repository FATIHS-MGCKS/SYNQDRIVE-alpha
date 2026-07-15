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

/**
 * Restricts routes to platform operators — not tenant org admins or workers.
 * Allows `MASTER_ADMIN` or JWT `platformPermissions` containing `master-billing`.
 */
@Injectable()
export class MasterBillingGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    const platformPermissions: string[] = Array.isArray(user.platformPermissions)
      ? user.platformPermissions
      : [];

    if (platformPermissions.includes(MASTER_BILLING_PLATFORM_PERMISSION)) {
      return true;
    }

    throw new ForbiddenException('Master billing access required');
  }
}
