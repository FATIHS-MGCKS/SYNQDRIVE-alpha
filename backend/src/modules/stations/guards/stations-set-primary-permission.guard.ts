import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { StationsAccessService } from '../stations-access.service';

@Injectable()
export class StationsSetPrimaryPermissionGuard implements CanActivate {
  constructor(private readonly stationsAccess: StationsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const orgId = await this.stationsAccess.assertStationsAccess(
      request,
      request.user,
      'stations.set_primary',
    );
    await this.stationsAccess.assertCanSetPrimary(orgId, request.user);
    return true;
  }
}
