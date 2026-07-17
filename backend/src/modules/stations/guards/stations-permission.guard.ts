import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STATIONS_PERMISSION_KEY } from '../decorators/require-stations-permission.decorator';
import { StationsAccessService } from '../stations-access.service';
import type { StationsV2PermissionAction } from '@shared/auth/stations-v2-permission.constants';
import { isStationsV2PermissionAction } from '@shared/auth/stations-v2-permission.constants';

/**
 * Gate 1 — Stations V2 permission enforcement.
 * Requires `@RequireStationsPermission(...)` on the handler.
 */
@Injectable()
export class StationsPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly stationsAccess: StationsAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<StationsV2PermissionAction>(
      STATIONS_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action) return true;

    if (!isStationsV2PermissionAction(action)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'STATIONS_PERMISSION_UNKNOWN',
        message: `Unknown permission: ${action}`,
      });
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    await this.stationsAccess.assertStationsAccess(request, user, action);
    return true;
  }
}
