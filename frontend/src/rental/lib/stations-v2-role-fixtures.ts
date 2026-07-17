import { buildStationsV2Permissions, type StationsV2PermissionsMap } from '../../lib/stations-v2-permissions';

function all(value: boolean): StationsV2PermissionsMap {
  return buildStationsV2Permissions(
    Object.fromEntries(
      [
        'read',
        'create',
        'update_master_data',
        'manage_operations',
        'activate',
        'deactivate',
        'archive',
        'restore',
        'set_primary',
        'manage_home_fleet',
        'manage_current_location',
        'manage_transfers',
        'manage_team',
        'view_activity',
        'geocode',
      ].map((key) => [key, value]),
    ),
  );
}

export const STATIONS_V2_ORG_ADMIN_PERMISSIONS = all(true);

export const STATIONS_V2_READ_ONLY_PERMISSIONS = buildStationsV2Permissions({
  read: true,
  view_activity: true,
});

export const STATIONS_V2_WORKER_PERMISSIONS = buildStationsV2Permissions({
  read: true,
  manage_current_location: true,
});
