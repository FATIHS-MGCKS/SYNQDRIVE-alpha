/**
 * Frontend mirror of backend Stations V2 permission constants and resolver.
 * Keep in sync with `backend/src/shared/auth/stations-v2-permission.*`.
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
  'override_rules',
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
  'override_rules',
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
  override_rules: 'Regeln manuell überschreiben',
  manage_team: 'Stations-Team verwalten',
  view_activity: 'Aktivität einsehen',
  geocode: 'Geocoding',
};

const STATIONS_V2_JSON_KEY = 'stationsV2';

export function isStationsV2PermissionAction(value: string): value is StationsV2PermissionAction {
  return (STATIONS_V2_PERMISSION_ACTIONS as readonly string[]).includes(value);
}

export function stationsV2ActionToKey(action: StationsV2PermissionAction): StationsV2PermissionKey {
  return action.slice('stations.'.length) as StationsV2PermissionKey;
}

export function buildStationsV2Permissions(
  flags: Partial<Record<StationsV2PermissionKey, boolean>>,
): StationsV2PermissionsMap {
  const out = {} as StationsV2PermissionsMap;
  for (const key of STATIONS_V2_PERMISSION_KEYS) {
    out[key] = flags[key] === true;
  }
  return out;
}

export function coerceStationsV2Permissions(raw: unknown): StationsV2PermissionsMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  const out = {} as StationsV2PermissionsMap;

  for (const key of STATIONS_V2_PERMISSION_KEYS) {
    out[key] = source[key] === true;
  }

  return out;
}

export function normalizeStationsV2Permissions(raw: unknown): StationsV2PermissionsMap | null {
  const explicit = coerceStationsV2Permissions(raw);
  if (!explicit) return null;
  const hasAny = STATIONS_V2_PERMISSION_KEYS.some((key) => explicit[key]);
  return hasAny ? explicit : null;
}

export function mapLegacyStationsModuleToV2(flags: {
  read?: boolean;
  write?: boolean;
  manage?: boolean;
}): StationsV2PermissionsMap {
  const out = buildStationsV2Permissions({});

  if (flags.manage === true) {
    for (const key of STATIONS_V2_PERMISSION_KEYS) {
      out[key] = true;
    }
    return out;
  }

  if (flags.read === true) {
    out.read = true;
    out.view_activity = true;
  }

  if (flags.write === true) {
    for (const key of STATIONS_V2_LEGACY_WRITE_KEYS) {
      out[key] = true;
    }
  }

  return out;
}

function extractLegacyStationsFlags(
  raw: Record<string, unknown>,
): { read?: boolean; write?: boolean; manage?: boolean } | null {
  const legacy = raw.stations;
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return null;
  const flags = legacy as Record<string, unknown>;
  return {
    read: flags.read === true,
    write: flags.write === true,
    manage: flags.manage === true,
  };
}

/**
 * Resolve effective Stations V2 permissions from raw membership JSON.
 * Prefers explicit `stationsV2`; falls back to legacy `stations` module mapping.
 */
export function resolveStationsV2Permissions(raw: unknown): StationsV2PermissionsMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(record, STATIONS_V2_JSON_KEY)) {
    return coerceStationsV2Permissions(record[STATIONS_V2_JSON_KEY]);
  }

  const legacyFlags = extractLegacyStationsFlags(record);
  if (!legacyFlags) return null;

  const mapped = mapLegacyStationsModuleToV2(legacyFlags);
  const hasAny = STATIONS_V2_PERMISSION_KEYS.some((key) => mapped[key]);
  return hasAny ? mapped : null;
}

export function evaluateStationsV2Permission(
  permissions: StationsV2PermissionsMap | null,
  action: StationsV2PermissionAction,
): boolean {
  if (!permissions) return false;
  const key = stationsV2ActionToKey(action);
  return permissions[key] === true;
}

export function hasAnyStationsWritePermission(permissions: StationsV2PermissionsMap | null): boolean {
  if (!permissions) return false;
  return STATIONS_V2_PERMISSION_KEYS.some((key) => key !== 'read' && key !== 'view_activity' && permissions[key]);
}
