import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Enforces RBAC based on the access evaluation order defined in Phase 3:
 * 1. authenticated
 * 2. user active
 * 3. resolve membership
 * 4. check product enabled
 * 5. check role permission
 * 6. check station scope
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    const hasRole = requiredRoles.some(
      (role) => user.platformRole === role || user.membershipRole === role,
    );

    if (!hasRole) {
      throw new ForbiddenException('Insufficient role permissions');
    }

    return true;
  }
}
