import { SetMetadata } from '@nestjs/common';
import type { StationScopeOptions } from '../stations/station-scope.types';

export const STATION_SCOPE_KEY = 'station_scope';

/**
 * Declarative station scope enforcement for org-scoped routes.
 * Requires `StationScopeGuard` on the handler/controller.
 *
 * When metadata is absent the guard is a no-op (controllers are wired incrementally).
 */
export const RequireStationScope = (options: StationScopeOptions = {}) =>
  SetMetadata(STATION_SCOPE_KEY, options);
