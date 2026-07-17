import { Prisma } from '@prisma/client';
import {
  evaluateStationsV2Permission,
  resolveStationsV2Permissions,
} from '@shared/auth/stations-v2-permission.util';
import type { StationsV2PermissionsMap } from '@shared/auth/stations-v2-permission.constants';
import { STATIONS_V2_PERMISSION_KEYS } from '@shared/auth/stations-v2-permission.constants';
import { STATION_SCOPE_MODE } from './station-scope.constants';
import type { StationScopeContext } from './station-scope.types';
import type {
  BookingAccessWhereInput,
  ResolveStationAccessScopeOptions,
  StationAccessScope,
  StationAccessWhereInput,
  StationFleetBookingScope,
  VehicleAccessWhereInput,
} from './station-access-scope.types';

const WRITE_PERMISSION_KEYS = STATIONS_V2_PERMISSION_KEYS.filter(
  (key) => key !== 'read' && key !== 'view_activity',
);

export function hasAnyStationsWritePermission(
  permissions: StationsV2PermissionsMap,
): boolean {
  return WRITE_PERMISSION_KEYS.some((key) => permissions[key]);
}

export function resolveStationAccessScope(
  scope: StationScopeContext,
  options: ResolveStationAccessScopeOptions = {},
): StationAccessScope {
  const resolved = resolvePermissionFlags(scope, options);
  const stationIds = resolveScopedStationIds(scope);

  const readableStationIds = resolveReadableStationIds(scope.mode, stationIds, resolved.canRead);
  const editableStationIds = resolveEditableStationIds(
    scope.mode,
    stationIds,
    resolved.canWrite,
  );

  const fleetBooking = buildFleetBookingScope(readableStationIds);

  return {
    orgId: scope.orgId,
    mode: scope.mode,
    allowedStationIds: stationIds,
    canRead: resolved.canRead,
    canWrite: resolved.canWrite,
    readableStationIds,
    editableStationIds,
    fleetBooking,
  };
}

export function resolveEmptyStationAccessScope(orgId: string): StationAccessScope {
  return resolveStationAccessScope(
    {
      orgId,
      mode: STATION_SCOPE_MODE.NO_STATIONS,
      allowedStationIds: [],
      bypassScope: false,
    },
    { canRead: false, canWrite: false },
  );
}

export function resolveStationAccessScopeFromContext(
  orgId: string,
  scope: StationScopeContext | undefined,
  options?: ResolveStationAccessScopeOptions,
): StationAccessScope {
  if (!scope) {
    return resolveEmptyStationAccessScope(orgId);
  }

  if (scope.orgId !== orgId) {
    return resolveEmptyStationAccessScope(orgId);
  }

  return resolveStationAccessScope(scope, options);
}

export function resolveStationAccessScopeFromPermissions(
  scope: StationScopeContext,
  permissionsRaw: unknown,
): StationAccessScope {
  const permissions = resolveStationsV2Permissions(permissionsRaw);
  return resolveStationAccessScope(scope, {
    canRead: permissions ? evaluateStationsV2Permission(permissions, 'stations.read') : false,
    canWrite: permissions ? hasAnyStationsWritePermission(permissions) : false,
  });
}

function resolvePermissionFlags(
  scope: StationScopeContext,
  options: ResolveStationAccessScopeOptions,
): { canRead: boolean; canWrite: boolean } {
  if (scope.mode === STATION_SCOPE_MODE.NO_STATIONS) {
    return { canRead: false, canWrite: false };
  }

  return {
    canRead: options.canRead ?? true,
    canWrite: options.canWrite ?? false,
  };
}

function resolveScopedStationIds(scope: StationScopeContext): string[] | null {
  if (scope.mode === STATION_SCOPE_MODE.ALL_STATIONS) {
    return null;
  }

  if (scope.mode === STATION_SCOPE_MODE.NO_STATIONS) {
    return [];
  }

  return scope.allowedStationIds ?? [];
}

function resolveReadableStationIds(
  mode: StationAccessScope['mode'],
  stationIds: string[] | null,
  canRead: boolean,
): string[] | null {
  if (!canRead || mode === STATION_SCOPE_MODE.NO_STATIONS) {
    return [];
  }

  if (mode === STATION_SCOPE_MODE.ALL_STATIONS) {
    return null;
  }

  return stationIds ?? [];
}

function resolveEditableStationIds(
  mode: StationAccessScope['mode'],
  stationIds: string[] | null,
  canWrite: boolean,
): string[] | null {
  if (!canWrite || mode === STATION_SCOPE_MODE.NO_STATIONS) {
    return [];
  }

  if (mode === STATION_SCOPE_MODE.ALL_STATIONS) {
    return null;
  }

  return stationIds ?? [];
}

function buildFleetBookingScope(
  readableStationIds: string[] | null,
): StationFleetBookingScope {
  return {
    vehicleStationIds: readableStationIds,
    bookingStationIds: readableStationIds,
  };
}

export function buildStationAccessWhere(
  access: StationAccessScope,
  extra?: Prisma.StationWhereInput,
): StationAccessWhereInput {
  const where: StationAccessWhereInput = {
    organizationId: access.orgId,
    ...extra,
  };

  return applyStationIdFilter(where, access.readableStationIds);
}

export function buildEditableStationAccessWhere(
  access: StationAccessScope,
  extra?: Prisma.StationWhereInput,
): StationAccessWhereInput {
  const where: StationAccessWhereInput = {
    organizationId: access.orgId,
    ...extra,
  };

  return applyStationIdFilter(where, access.editableStationIds);
}

export function buildVehicleHomeAccessWhere(
  access: StationAccessScope,
): VehicleAccessWhereInput {
  const base: VehicleAccessWhereInput = { organizationId: access.orgId };
  const ids = access.fleetBooking.vehicleStationIds;

  if (ids === null) {
    return base;
  }

  if (ids.length === 0) {
    return { ...base, id: { in: [] } };
  }

  return {
    ...base,
    homeStationId: { in: ids },
  };
}

export function buildFleetVehicleAccessWhere(
  access: StationAccessScope,
): VehicleAccessWhereInput {
  const base: VehicleAccessWhereInput = { organizationId: access.orgId };
  const ids = access.fleetBooking.vehicleStationIds;

  if (ids === null) {
    return base;
  }

  if (ids.length === 0) {
    return { ...base, id: { in: [] } };
  }

  return {
    ...base,
    OR: [
      { homeStationId: { in: ids } },
      { currentStationId: { in: ids } },
      { expectedStationId: { in: ids } },
    ],
  };
}

export function buildBookingAccessWhere(
  access: StationAccessScope,
  extra?: Prisma.BookingWhereInput,
): BookingAccessWhereInput {
  const where: BookingAccessWhereInput = {
    organizationId: access.orgId,
    ...extra,
  };

  const ids = access.fleetBooking.bookingStationIds;
  if (ids === null) {
    return where;
  }

  if (ids.length === 0) {
    return { ...where, id: { in: [] } };
  }

  return {
    ...where,
    OR: [{ pickupStationId: { in: ids } }, { returnStationId: { in: ids } }],
  };
}

export function isStationReadableInAccessScope(
  access: StationAccessScope,
  stationId: string,
): boolean {
  if (!access.canRead) return false;
  if (access.readableStationIds === null) return true;
  return access.readableStationIds.includes(stationId);
}

export function isStationEditableInAccessScope(
  access: StationAccessScope,
  stationId: string,
): boolean {
  if (!access.canWrite) return false;
  if (access.editableStationIds === null) return true;
  return access.editableStationIds.includes(stationId);
}

function applyStationIdFilter(
  where: StationAccessWhereInput,
  stationIds: string[] | null,
): StationAccessWhereInput {
  if (stationIds === null) {
    return where;
  }

  return {
    ...where,
    id: { in: stationIds },
  };
}

/** Vehicles linked to a specific station (home / current / expected). */
export function buildStationLinkedVehicleWhere(
  access: StationAccessScope,
  stationId: string,
): VehicleAccessWhereInput {
  if (!isStationReadableInAccessScope(access, stationId)) {
    return { organizationId: access.orgId, id: { in: [] } };
  }

  return {
    organizationId: access.orgId,
    OR: [
      { homeStationId: stationId },
      { currentStationId: stationId },
      { expectedStationId: stationId },
    ],
  };
}

/** Fleet tab at `:id/fleet` — station must be readable; vehicles scoped to station linkage. */
export function buildStationFleetWhere(
  access: StationAccessScope,
  stationId: string,
): VehicleAccessWhereInput {
  return buildStationLinkedVehicleWhere(access, stationId);
}

/** Bookings tab and pickup/return lists — includes historical rows for archived stations. */
export function buildStationBookingsWhere(
  access: StationAccessScope,
  stationId: string,
  extra?: Prisma.BookingWhereInput,
): BookingAccessWhereInput {
  if (!isStationReadableInAccessScope(access, stationId)) {
    return { organizationId: access.orgId, id: { in: [] } };
  }

  return {
    organizationId: access.orgId,
    OR: [{ pickupStationId: stationId }, { returnStationId: stationId }],
    ...extra,
  };
}

export function buildStationPickupBookingsWhere(
  access: StationAccessScope,
  stationId: string,
  extra?: Prisma.BookingWhereInput,
): BookingAccessWhereInput {
  if (!isStationReadableInAccessScope(access, stationId)) {
    return { organizationId: access.orgId, id: { in: [] } };
  }

  return {
    organizationId: access.orgId,
    pickupStationId: stationId,
    ...extra,
  };
}

export function buildStationReturnBookingsWhere(
  access: StationAccessScope,
  stationId: string,
  extra?: Prisma.BookingWhereInput,
): BookingAccessWhereInput {
  if (!isStationReadableInAccessScope(access, stationId)) {
    return { organizationId: access.orgId, id: { in: [] } };
  }

  return {
    organizationId: access.orgId,
    returnStationId: stationId,
    ...extra,
  };
}

/** Open tasks linked to station vehicles, bookings, or metadata.stationId. */
export function buildStationOpenTasksWhere(
  access: StationAccessScope,
  stationId: string,
  linkedVehicleIds: string[],
  linkedBookingIds: string[],
): Prisma.OrgTaskWhereInput {
  if (!isStationReadableInAccessScope(access, stationId)) {
    return { organizationId: access.orgId, id: { in: [] } };
  }

  const orFilters: Prisma.OrgTaskWhereInput[] = [
    { metadata: { path: ['stationId'], equals: stationId } },
  ];

  if (linkedVehicleIds.length > 0) {
    orFilters.push({ vehicleId: { in: linkedVehicleIds } });
  }
  if (linkedBookingIds.length > 0) {
    orFilters.push({ bookingId: { in: linkedBookingIds } });
  }

  return {
    organizationId: access.orgId,
    status: { in: ['OPEN', 'IN_PROGRESS'] },
    OR: orFilters,
  };
}

export function buildStationActivityWhere(
  access: StationAccessScope,
  stationId: string,
): Prisma.ActivityLogWhereInput {
  if (!isStationReadableInAccessScope(access, stationId)) {
    return { organizationId: access.orgId, id: { in: [] } };
  }

  return {
    organizationId: access.orgId,
    entity: 'STATION',
    entityId: stationId,
  };
}
