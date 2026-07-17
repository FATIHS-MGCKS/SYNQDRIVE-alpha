import { SetMetadata } from '@nestjs/common';
import type { StationsV2PermissionAction } from '@shared/auth/stations-v2-permission.constants';

export const STATIONS_PERMISSION_KEY = 'required_stations_permission';

/**
 * Declarative Stations V2 permission for org-scoped station routes.
 * Enforced by `StationsPermissionGuard` before `StationScopeGuard`.
 */
export const RequireStationsPermission = (action: StationsV2PermissionAction) =>
  SetMetadata(STATIONS_PERMISSION_KEY, action);
