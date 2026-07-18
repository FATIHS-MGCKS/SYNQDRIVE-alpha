import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { StationsAccessService } from '../stations-access.service';

@Injectable()
export class StationsManageTransfersPermissionGuard implements CanActivate {
  constructor(private readonly stationsAccess: StationsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    await this.stationsAccess.assertStationsAccess(
      request,
      request.user,
      'stations.manage_transfers',
    );
    return true;
  }
}
