import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STATION_SCOPE_KEY } from '@shared/decorators/station-scope.decorator';
import type { StationScopeOptions } from '@shared/stations/station-scope.types';
import { StationScopeService } from '@shared/stations/station-scope.service';

/**
 * Gate 2 — Station scope enforcement for Stations V2.
 *
 * Must run AFTER `OrgScopingGuard` (membership + tenant context).
 * Permission checks (Gate 1) are handled separately.
 *
 * Handlers without `@RequireStationScope()` pass through until explicitly wired.
 */
@Injectable()
export class StationScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly stationScopeService: StationScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<StationScopeOptions | undefined>(
      STATION_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    await this.stationScopeService.enforceRequestScope(request, options);
    return true;
  }
}
