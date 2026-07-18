import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { StationsAccessService } from '../stations-access.service';
import { STATION_RULE_MANUAL_OVERRIDE_PERMISSION } from '@shared/stations/station-rule-manual-override.contract';

@Injectable()
export class StationsOverrideRulesPermissionGuard implements CanActivate {
  constructor(private readonly stationsAccess: StationsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    await this.stationsAccess.assertStationsAccess(
      request,
      request.user,
      STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
    );
    return true;
  }
}
