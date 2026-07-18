import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StationAccessService } from '@shared/stations/station-access.service';
import { isStationsV2FeatureEnabled } from '@shared/stations/stations-v2-feature-flags.resolver';

/**
 * Gate-2 station scope on `:id` routes (SEC-05, SEC-07, SEC-08).
 */
@Injectable()
export class StationScopeGuard implements CanActivate {
  constructor(private readonly stationAccess: StationAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orgId = request.params?.orgId as string | undefined;
    const userId = request.user?.id as string | undefined;

    if (!orgId || !userId) return true;
    if (!isStationsV2FeatureEnabled(orgId, 'stationsScopeV2Enabled')) return true;

    const stationId =
      (request.params?.id as string | undefined) ||
      (request.params?.stationId as string | undefined) ||
      (request.body?.stationId as string | undefined);

    if (!stationId) return true;

    const access = await this.stationAccess.resolve(userId, orgId);
    request.stationAccess = access;

    try {
      this.stationAccess.assertStationReadable(access, stationId);
      return true;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new ForbiddenException('Access restricted by station scope');
    }
  }
}
