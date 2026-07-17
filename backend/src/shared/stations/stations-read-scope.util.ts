import { Prisma } from '@prisma/client';
import type { StationScopeContext } from './station-scope.types';
import type { StationAccessScope } from './station-access-scope.types';
import {
  buildStationAccessWhere,
  buildVehicleHomeAccessWhere,
  isStationReadableInAccessScope,
  resolveStationAccessScopeFromContext,
} from './station-access-scope.util';

/** @deprecated Prefer StationAccessScopeService — kept for unmigrated read paths. */
export function buildScopedStationWhere(
  organizationId: string,
  scope: StationScopeContext | undefined,
  extra?: Prisma.StationWhereInput,
): Prisma.StationWhereInput {
  const access = resolveStationAccessScopeFromContext(organizationId, scope);
  return buildStationAccessWhere(access, extra);
}

/** @deprecated Prefer StationAccessScopeService — kept for unmigrated read paths. */
export function buildScopedVehicleHomeWhere(
  organizationId: string,
  scope: StationScopeContext | undefined,
): Prisma.VehicleWhereInput {
  const access = resolveStationAccessScopeFromContext(organizationId, scope);
  return buildVehicleHomeAccessWhere(access);
}

/** @deprecated Prefer StationAccessScopeService.isStationReadable */
export function isStationVisibleInScope(
  stationId: string,
  scope: StationScopeContext | undefined,
  orgId?: string,
): boolean {
  if (!scope) {
    return false;
  }

  const access: StationAccessScope = resolveStationAccessScopeFromContext(
    orgId ?? scope.orgId,
    scope,
  );
  return isStationReadableInAccessScope(access, stationId);
}
