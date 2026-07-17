import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { StationsAccessService } from '../stations-access.service';
import { resolveUpdateStationPermissions } from '../stations-mutation-permission.util';
import type { UpdateStationDto } from '../dto/update-station.dto';

@Injectable()
export class StationsUpdatePermissionGuard implements CanActivate {
  constructor(private readonly stationsAccess: StationsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body as UpdateStationDto | undefined;
    const actions = resolveUpdateStationPermissions(body);

    if (actions.length === 0) {
      throw new BadRequestException('No supported station fields provided for update');
    }

    await this.stationsAccess.assertStationsAccessForActions(request, request.user, actions);
    return true;
  }
}
