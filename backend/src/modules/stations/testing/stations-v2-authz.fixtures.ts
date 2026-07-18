import { MembershipRole, StationStatus } from '@prisma/client';
import {
  STATIONS_V2_DRIVER_PERMISSIONS,
  STATIONS_V2_ORG_ADMIN_PERMISSIONS,
  STATIONS_V2_READ_ONLY_PERMISSIONS,
  STATIONS_V2_STATION_MANAGER_PERMISSIONS,
  STATIONS_V2_WORKER_PERMISSIONS,
} from '@shared/auth/stations-v2-role-permissions';
import type { StationsV2PermissionAction } from '@shared/auth/stations-v2-permission.constants';
import type { StationScopeOptions } from '@shared/stations/station-scope.types';

export const AUTHZ_ORG_A = 'org-tenant-a';
export const AUTHZ_ORG_B = 'org-tenant-b';
export const AUTHZ_STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const AUTHZ_STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const AUTHZ_STATION_ARCHIVED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const AUTHZ_STATION_MISSING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const AUTHZ_VEHICLE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

export type AuthzPersonaKey =
  | 'orgAdmin'
  | 'stationManager'
  | 'worker'
  | 'driver'
  | 'readOnly';

export interface AuthzPersona {
  key: AuthzPersonaKey;
  userId: string;
  membership: {
    role: MembershipRole;
    stationScope: string | null;
    stationIds: string[] | null;
    permissions: { stationsV2: Record<string, boolean> };
  };
  organizationId: string;
}

export const AUTHZ_PERSONAS: Record<AuthzPersonaKey, AuthzPersona> = {
  orgAdmin: {
    key: 'orgAdmin',
    userId: 'user-org-admin',
    organizationId: AUTHZ_ORG_A,
    membership: {
      role: MembershipRole.ORG_ADMIN,
      stationScope: 'ALL',
      stationIds: null,
      permissions: { stationsV2: STATIONS_V2_ORG_ADMIN_PERMISSIONS },
    },
  },
  stationManager: {
    key: 'stationManager',
    userId: 'user-station-manager',
    organizationId: AUTHZ_ORG_A,
    membership: {
      role: MembershipRole.SUB_ADMIN,
      stationScope: AUTHZ_STATION_A,
      stationIds: [AUTHZ_STATION_A],
      permissions: { stationsV2: STATIONS_V2_STATION_MANAGER_PERMISSIONS },
    },
  },
  worker: {
    key: 'worker',
    userId: 'user-worker',
    organizationId: AUTHZ_ORG_A,
    membership: {
      role: MembershipRole.WORKER,
      stationScope: AUTHZ_STATION_A,
      stationIds: [AUTHZ_STATION_A],
      permissions: { stationsV2: STATIONS_V2_WORKER_PERMISSIONS },
    },
  },
  driver: {
    key: 'driver',
    userId: 'user-driver',
    organizationId: AUTHZ_ORG_A,
    membership: {
      role: MembershipRole.DRIVER,
      stationScope: null,
      stationIds: null,
      permissions: { stationsV2: STATIONS_V2_DRIVER_PERMISSIONS },
    },
  },
  readOnly: {
    key: 'readOnly',
    userId: 'user-read-only',
    organizationId: AUTHZ_ORG_A,
    membership: {
      role: MembershipRole.SUB_ADMIN,
      stationScope: AUTHZ_STATION_A,
      stationIds: [AUTHZ_STATION_A],
      permissions: { stationsV2: STATIONS_V2_READ_ONLY_PERMISSIONS },
    },
  },
};

export interface AuthzEndpointCase {
  key: string;
  method: string;
  permission?: StationsV2PermissionAction;
  scope: StationScopeOptions;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  specializedGuard?: 'update' | 'setPrimary' | 'assignVehicle' | 'vehicleLocation' | 'changeVehicleHome';
}

export const AUTHZ_READ_ENDPOINTS: AuthzEndpointCase[] = [
  { key: 'list', method: 'GET', permission: 'stations.read', scope: { resource: 'list' } },
  { key: 'stats', method: 'GET', permission: 'stations.read', scope: { resource: 'list' } },
  {
    key: 'detail',
    method: 'GET',
    permission: 'stations.read',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'overview-stats',
    method: 'GET',
    permission: 'stations.read',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'fleet',
    method: 'GET',
    permission: 'stations.read',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'bookings',
    method: 'GET',
    permission: 'stations.read',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'operations',
    method: 'GET',
    permission: 'stations.read',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'team',
    method: 'GET',
    permission: 'stations.read',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'activity',
    method: 'GET',
    permission: 'stations.view_activity',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'archive-preview',
    method: 'GET',
    permission: 'stations.archive',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'restore-preview',
    method: 'GET',
    permission: 'stations.restore',
    scope: { resource: 'station', allowArchivedLifecycleWrite: true },
    params: { id: AUTHZ_STATION_ARCHIVED },
  },
];

export const AUTHZ_MUTATION_ENDPOINTS: AuthzEndpointCase[] = [
  {
    key: 'create',
    method: 'POST',
    permission: 'stations.create',
    scope: { resource: 'create' },
    body: { name: 'New Station' },
  },
  {
    key: 'update-master',
    method: 'PATCH',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
    body: { name: 'Renamed' },
    specializedGuard: 'update',
  },
  {
    key: 'update-operations',
    method: 'PATCH',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
    body: { capacity: 12 },
    specializedGuard: 'update',
  },
  {
    key: 'archive',
    method: 'POST',
    permission: 'stations.archive',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
  {
    key: 'restore',
    method: 'POST',
    permission: 'stations.restore',
    scope: { resource: 'station', allowArchivedLifecycleWrite: true },
    params: { id: AUTHZ_STATION_ARCHIVED },
    body: { pickupEnabled: false, returnEnabled: false },
  },
  {
    key: 'set-primary',
    method: 'POST',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
    specializedGuard: 'setPrimary',
  },
  {
    key: 'set-vehicles',
    method: 'PUT',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
    body: { vehicleIds: [AUTHZ_VEHICLE] },
    specializedGuard: 'assignVehicle',
  },
  {
    key: 'assign-vehicle-home',
    method: 'POST',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
    body: { vehicleId: AUTHZ_VEHICLE, target: 'home' },
    specializedGuard: 'assignVehicle',
  },
  {
    key: 'assign-vehicle-expected',
    method: 'POST',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
    body: { vehicleId: AUTHZ_VEHICLE, target: 'expected' },
    specializedGuard: 'assignVehicle',
  },
  {
    key: 'vehicle-current-station',
    method: 'PATCH',
    scope: { resource: 'vehicle_location' },
    body: { vehicleId: AUTHZ_VEHICLE, currentStationId: AUTHZ_STATION_A },
    specializedGuard: 'vehicleLocation',
  },
  {
    key: 'change-vehicle-home-station',
    method: 'POST',
    scope: { resource: 'vehicle_location' },
    body: {
      vehicleId: AUTHZ_VEHICLE,
      newHomeStationId: AUTHZ_STATION_B,
      expectedVersion: 0,
    },
    specializedGuard: 'changeVehicleHome',
  },
  {
    key: 'backfill-coordinates',
    method: 'POST',
    permission: 'stations.geocode',
    scope: { resource: 'list' },
  },
  {
    key: 'delete',
    method: 'DELETE',
    permission: 'stations.archive',
    scope: { resource: 'station' },
    params: { id: AUTHZ_STATION_A },
  },
];

export function stationStatusRecord(
  stationId: string,
  orgId: string,
  status: StationStatus = StationStatus.ACTIVE,
) {
  return { id: stationId, organizationId: orgId, status };
}
