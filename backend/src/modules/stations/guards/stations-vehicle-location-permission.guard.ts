import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { StationsAccessService } from '../stations-access.service';
import { resolveVehicleLocationMutationPermissions } from '../stations-mutation-permission.util';
import type { UpdateVehicleCurrentStationDto } from '../dto/assign-vehicle-station.dto';

@Injectable()
export class StationsVehicleLocationPermissionGuard implements CanActivate {
  constructor(private readonly stationsAccess: StationsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body as UpdateVehicleCurrentStationDto;
    const actions = resolveVehicleLocationMutationPermissions(body ?? {});

    if (actions.length === 0) {
      throw new BadRequestException('currentStationId or expectedStationId is required');
    }

    await this.stationsAccess.assertStationsAccessForActions(request, request.user, actions);
    return true;
  }
}
