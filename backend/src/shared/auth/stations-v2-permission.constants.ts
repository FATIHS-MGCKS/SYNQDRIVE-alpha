/**
 * Canonical Stations V2 permission actions (dotted keys).
 * Stored in membership JSON as `permissions.stationsV2.{key}` booleans.
 */
export const STATIONS_V2_PERMISSION_KEYS = [
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
] as const;

export type StationsV2PermissionKey = (typeof STATIONS_V2_PERMISSION_KEYS)[number];

export type StationsV2PermissionsMap = Record<StationsV2PermissionKey, boolean>;

export const STATIONS_V2_PERMISSION_ACTIONS = STATIONS_V2_PERMISSION_KEYS.map(
  (key) => `stations.${key}` as const,
);

export type StationsV2PermissionAction = (typeof STATIONS_V2_PERMISSION_ACTIONS)[number];

/** Write keys granted by legacy `stations.write` (conservative — excludes archive, set_primary, geocode). */
export const STATIONS_V2_LEGACY_WRITE_KEYS: readonly StationsV2PermissionKey[] = [
  'create',
  'update_master_data',
  'manage_operations',
  'activate',
  'deactivate',
  'restore',
  'manage_home_fleet',
  'manage_current_location',
  'manage_transfers',
  'manage_team',
] as const;

export const STATIONS_V2_PERMISSION_LABELS: Readonly<Record<StationsV2PermissionKey, string>> = {
  read: 'Stationen lesen',
  create: 'Station anlegen',
  update_master_data: 'Stammdaten bearbeiten',
  manage_operations: 'Betrieb & Kalender',
  activate: 'Station aktivieren',
  deactivate: 'Station deaktivieren',
  archive: 'Station archivieren',
  restore: 'Station wiederherstellen',
  set_primary: 'Hauptstation setzen',
  manage_home_fleet: 'Heimat-Flotte verwalten',
  manage_current_location: 'Aktuellen Standort verwalten',
  manage_transfers: 'Transfers verwalten',
  manage_team: 'Stations-Team verwalten',
  view_activity: 'Aktivität einsehen',
  geocode: 'Geocoding',
};

export function isStationsV2PermissionKey(value: string): value is StationsV2PermissionKey {
  return (STATIONS_V2_PERMISSION_KEYS as readonly string[]).includes(value);
}

export function isStationsV2PermissionAction(value: string): value is StationsV2PermissionAction {
  return (STATIONS_V2_PERMISSION_ACTIONS as readonly string[]).includes(value);
}

export function stationsV2ActionToKey(action: StationsV2PermissionAction): StationsV2PermissionKey {
  return action.slice('stations.'.length) as StationsV2PermissionKey;
}
