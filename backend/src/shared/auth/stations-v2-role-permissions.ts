import {
  STATIONS_V2_PERMISSION_KEYS,
  type StationsV2PermissionKey,
  type StationsV2PermissionsMap,
} from './stations-v2-permission.constants';

export function buildStationsV2Permissions(
  flags: Partial<Record<StationsV2PermissionKey, boolean>>,
): StationsV2PermissionsMap {
  const out = {} as StationsV2PermissionsMap;
  for (const key of STATIONS_V2_PERMISSION_KEYS) {
    out[key] = flags[key] === true;
  }
  return out;
}

function allStationsV2(value: boolean): StationsV2PermissionsMap {
  return buildStationsV2Permissions(
    Object.fromEntries(STATIONS_V2_PERMISSION_KEYS.map((key) => [key, value])) as Partial<
      Record<StationsV2PermissionKey, boolean>
    >,
  );
}

/** Full matrix — Master Admin / Org Admin. */
export const STATIONS_V2_ORG_ADMIN_PERMISSIONS = allStationsV2(true);

/** Sub Admin — no create, archive, set_primary. */
export const STATIONS_V2_SUB_ADMIN_PERMISSIONS = buildStationsV2Permissions({
  read: true,
  update_master_data: true,
  manage_operations: true,
  activate: true,
  deactivate: true,
  restore: true,
  manage_home_fleet: true,
  manage_current_location: true,
  manage_transfers: true,
  override_rules: true,
  manage_team: true,
  view_activity: true,
  geocode: true,
});

/** Station Manager — local ops without lifecycle admin keys. */
export const STATIONS_V2_STATION_MANAGER_PERMISSIONS = buildStationsV2Permissions({
  read: true,
  update_master_data: true,
  manage_operations: true,
  manage_home_fleet: true,
  manage_current_location: true,
  manage_transfers: true,
  override_rules: true,
  manage_team: true,
  view_activity: true,
  geocode: true,
});

/** Worker / Field Agent — read + current location at assigned station. */
export const STATIONS_V2_WORKER_PERMISSIONS = buildStationsV2Permissions({
  read: true,
  manage_current_location: true,
});

/** Read-only — list/detail + activity. */
export const STATIONS_V2_READ_ONLY_PERMISSIONS = buildStationsV2Permissions({
  read: true,
  view_activity: true,
});

/** Driver — no stations access. */
export const STATIONS_V2_DRIVER_PERMISSIONS = allStationsV2(false);

/**
 * Default `stationsV2` block per organization role template (`systemKey`).
 * Aligns with `docs/architecture/stations-v2-permissions.md` §6.
 */
export const STATIONS_V2_ROLE_DEFAULTS: Readonly<Record<string, StationsV2PermissionsMap>> = {
  org_admin: STATIONS_V2_ORG_ADMIN_PERMISSIONS,
  sub_admin: STATIONS_V2_SUB_ADMIN_PERMISSIONS,
  disposition: STATIONS_V2_READ_ONLY_PERMISSIONS,
  accounting: STATIONS_V2_READ_ONLY_PERMISSIONS,
  station_manager: STATIONS_V2_STATION_MANAGER_PERMISSIONS,
  employee: STATIONS_V2_WORKER_PERMISSIONS,
  driver: STATIONS_V2_DRIVER_PERMISSIONS,
  field_agent: STATIONS_V2_WORKER_PERMISSIONS,
  service: STATIONS_V2_READ_ONLY_PERMISSIONS,
  read_only: STATIONS_V2_READ_ONLY_PERMISSIONS,
};

export function stationsV2PermissionsForRoleTemplate(systemKey: string): StationsV2PermissionsMap | null {
  return STATIONS_V2_ROLE_DEFAULTS[systemKey] ?? null;
}
