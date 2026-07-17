import { Prisma } from '@prisma/client';
import { STATION_SCOPE_MODE } from './station-scope.constants';
import type { StationScopeContext } from './station-scope.types';

export function buildScopedStationWhere(
  organizationId: string,
  scope: StationScopeContext | undefined,
  extra?: Prisma.StationWhereInput,
): Prisma.StationWhereInput {
  const where: Prisma.StationWhereInput = {
    organizationId,
    ...extra,
  };

  if (!scope || scope.mode === STATION_SCOPE_MODE.ALL_STATIONS) {
    return where;
  }

  if (scope.mode === STATION_SCOPE_MODE.NO_STATIONS) {
    return {
      ...where,
      id: { in: [] },
    };
  }

  const allowed = scope.allowedStationIds ?? [];
  return {
    ...where,
    id: { in: allowed },
  };
}

export function buildScopedVehicleHomeWhere(
  organizationId: string,
  scope: StationScopeContext | undefined,
): Prisma.VehicleWhereInput {
  const base: Prisma.VehicleWhereInput = { organizationId };

  if (!scope || scope.mode === STATION_SCOPE_MODE.ALL_STATIONS) {
    return base;
  }

  if (scope.mode === STATION_SCOPE_MODE.NO_STATIONS) {
    return { ...base, id: { in: [] } };
  }

  const allowed = scope.allowedStationIds ?? [];
  return {
    ...base,
    homeStationId: { in: allowed },
  };
}

export function isStationVisibleInScope(
  stationId: string,
  scope: StationScopeContext | undefined,
): boolean {
  if (!scope || scope.mode === STATION_SCOPE_MODE.ALL_STATIONS) return true;
  if (scope.mode === STATION_SCOPE_MODE.NO_STATIONS) return false;
  return (scope.allowedStationIds ?? []).includes(stationId);
}
