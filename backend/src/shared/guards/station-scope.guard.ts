import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { isStationsV2FeatureEnabled } from '@shared/stations/stations-v2-feature-flags.resolver';

/**
 * Restricts Sub Admin and Worker access to their assigned station scope.
 * Part of the Phase 3 access evaluation chain (step 6).
 *
 * When `stationsScopeV2Enabled` is off, legacy scope behavior is preserved.
 */
@Injectable()
export class StationScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const orgId = request.params?.orgId as string | undefined;

    if (orgId && !isStationsV2FeatureEnabled(orgId, 'stationsScopeV2Enabled')) {
      return true;
    }

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
