import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

/**
 * Restricts Sub Admin and Worker access to their assigned station scope.
 * Part of the Phase 3 access evaluation chain (step 6).
 */
@Injectable()
export class StationScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.stationScope) {
      return true;
    }

    const stationId = request.params.stationId || request.body?.stationId;

    if (stationId && user.stationScope !== stationId) {
      throw new ForbiddenException('Access restricted by station scope');
    }

    return true;
  }
}
