import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { StationsAccessService } from '../stations-access.service';
import { resolveAssignVehiclePermission } from '../stations-mutation-permission.util';
import type { AssignVehicleStationDto } from '../dto/assign-vehicle-station.dto';

@Injectable()
export class StationsAssignVehiclePermissionGuard implements CanActivate {
  constructor(private readonly stationsAccess: StationsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body as AssignVehicleStationDto;
    const action = resolveAssignVehiclePermission(body?.target);

    await this.stationsAccess.assertStationsAccess(request, request.user, action);
    return true;
  }
}
