/** Canonical privacy category for all live/historical vehicle position reads. */
export const LIVE_GPS_DATA_CATEGORY = 'GPS_LOCATION' as const;

/** Decision action for every GPS read path. */
export const LIVE_GPS_READ_ACTION = 'READ' as const;

export const LIVE_GPS_PURPOSE = {
  LIVE_MAP: 'LIVE_MAP',
  TRIPS: 'TRIPS',
  FLEET_ANALYTICS: 'FLEET_ANALYTICS',
  TECHNICAL_OVERVIEW: 'TECHNICAL_OVERVIEW',
} as const;

export type LiveGpsPurpose = (typeof LIVE_GPS_PURPOSE)[keyof typeof LIVE_GPS_PURPOSE];

/** Stable service identities — required on every decision request. */
export const LIVE_GPS_SERVICE_IDENTITY = {
  VEHICLES_LIVE_GPS_API: 'synqdrive-vehicles-live-gps',
  VEHICLES_TELEMETRY_API: 'synqdrive-vehicles-telemetry',
  FLEET_MAP_API: 'synqdrive-fleet-map',
  VEHICLES_LIST_API: 'synqdrive-vehicles-list',
  VEHICLE_DETAIL_API: 'synqdrive-vehicle-detail',
  FLEET_CONNECTIVITY_API: 'synqdrive-fleet-connectivity',
  TRIPS_ROUTE_API: 'synqdrive-trips-route',
  TRIPS_DETAIL_API: 'synqdrive-trips-detail',
  WHATSAPP_TOOLS: 'synqdrive-whatsapp-tools',
  MASTER_ADMIN_SUPPORT: 'synqdrive-master-admin-support',
} as const;

export type LiveGpsServiceIdentity =
  (typeof LIVE_GPS_SERVICE_IDENTITY)[keyof typeof LIVE_GPS_SERVICE_IDENTITY];

export const LIVE_GPS_FLEET_MAP_CACHE_KEY_PREFIX = 'fleet-map:';

export function fleetMapCacheKey(organizationId: string): string {
  return `${LIVE_GPS_FLEET_MAP_CACHE_KEY_PREFIX}${organizationId}:v1`;
}
