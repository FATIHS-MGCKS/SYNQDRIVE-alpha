import type { DataAuthorizationPurpose } from './data-authorization.constants';

/** Canonical GPS/position access purposes — map to consent `purposes` field. */
export type GpsPositionAccessPurpose = Extract<
  DataAuthorizationPurpose,
  'LIVE_MAP' | 'FLEET_ANALYTICS' | 'TRIPS' | 'TECHNICAL_OVERVIEW'
>;

export const GPS_POSITION_ACCESS_PURPOSES: readonly GpsPositionAccessPurpose[] = [
  'LIVE_MAP',
  'FLEET_ANALYTICS',
  'TRIPS',
  'TECHNICAL_OVERVIEW',
] as const;

/** Primary data category checked per purpose (existing consent records). */
export const GPS_PURPOSE_DATA_CATEGORY: Record<GpsPositionAccessPurpose, string> = {
  LIVE_MAP: 'GPS_LOCATION',
  FLEET_ANALYTICS: 'GPS_LOCATION',
  TRIPS: 'TRIP_DATA',
  TECHNICAL_OVERVIEW: 'TELEMETRY_DATA',
};

/** Documented system-job ingest purpose — not an HTTP user request. */
export const GPS_SYSTEM_INGEST_PURPOSE = 'TECHNICAL_OVERVIEW' as const;
export const GPS_SYSTEM_INGEST_CATEGORY = 'TELEMETRY_DATA' as const;
export const GPS_SYSTEM_JOB_NAME = 'dimo.snapshot.poll' as const;
