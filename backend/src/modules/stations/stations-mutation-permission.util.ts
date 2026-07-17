import type { StationsV2PermissionAction } from '@shared/auth/stations-v2-permission.constants';
import type { UpdateStationDto } from './dto/update-station.dto';

const MASTER_DATA_FIELDS = new Set([
  'name',
  'code',
  'type',
  'address',
  'addressLine2',
  'city',
  'postalCode',
  'country',
  'latitude',
  'longitude',
  'timezone',
  'phone',
  'email',
  'notes',
  'internalNotes',
  'googlePlaceId',
]);

const OPERATIONS_FIELDS = new Set([
  'pickupEnabled',
  'returnEnabled',
  'afterHoursReturnEnabled',
  'keyBoxAvailable',
  'capacity',
  'radiusMeters',
  'openingHours',
  'holidayRules',
  'handoverInstructions',
  'returnInstructions',
]);

const TEAM_FIELDS = new Set(['managerName']);

export function resolveUpdateStationPermissions(
  body: UpdateStationDto | undefined,
): StationsV2PermissionAction[] {
  if (!body || typeof body !== 'object') return [];

  const permissions = new Set<StationsV2PermissionAction>();
  const touched = Object.entries(body).filter(([, value]) => value !== undefined);

  for (const [key] of touched) {
    if (MASTER_DATA_FIELDS.has(key)) {
      permissions.add('stations.update_master_data');
    }
    if (OPERATIONS_FIELDS.has(key)) {
      permissions.add('stations.manage_operations');
    }
    if (TEAM_FIELDS.has(key)) {
      permissions.add('stations.manage_team');
    }
  }

  if (body.isPrimary === true) {
    permissions.add('stations.set_primary');
  }

  if (body.status === 'ACTIVE') {
    permissions.add('stations.activate');
  } else if (body.status === 'INACTIVE') {
    permissions.add('stations.deactivate');
  } else if (body.status === 'ARCHIVED') {
    permissions.add('stations.archive');
  }

  return [...permissions];
}

export function resolveAssignVehiclePermission(
  target: 'home' | 'current' | 'expected' | undefined,
): StationsV2PermissionAction {
  switch (target ?? 'home') {
    case 'current':
      return 'stations.manage_current_location';
    case 'expected':
      return 'stations.manage_transfers';
    default:
      return 'stations.manage_home_fleet';
  }
}

export function resolveVehicleLocationMutationPermissions(body: {
  currentStationId?: string | null;
  expectedStationId?: string | null;
}): StationsV2PermissionAction[] {
  const permissions = new Set<StationsV2PermissionAction>();

  if (body.currentStationId !== undefined) {
    permissions.add('stations.manage_current_location');
  }
  if (body.expectedStationId !== undefined) {
    permissions.add('stations.manage_transfers');
  }

  return [...permissions];
}
