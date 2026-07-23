import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';
import { LIVE_GPS_PURPOSE, LIVE_GPS_SERVICE_IDENTITY } from '../live-gps-enforcement/live-gps-enforcement.constants';

export const TRIP_LOCATION_ACTION = {
  INGEST: AUTHORIZATION_DECISION_ACTION.INGEST,
  DERIVE: AUTHORIZATION_DECISION_ACTION.DERIVE,
  READ: AUTHORIZATION_DECISION_ACTION.READ,
  EXPORT: AUTHORIZATION_DECISION_ACTION.EXPORT,
} as const;

export const TRIP_LOCATION_DATA_CATEGORY = {
  GPS_LOCATION: 'GPS_LOCATION',
  TRIP_DATA: 'TRIP_DATA',
  DRIVING_BEHAVIOR: 'DRIVING_BEHAVIOR',
} as const;

export const TRIP_LOCATION_PURPOSE = {
  TRIPS: LIVE_GPS_PURPOSE.TRIPS,
  FLEET_ANALYTICS: 'FLEET_ANALYTICS',
  RENTAL_ANALYTICS: 'RENTAL_ANALYTICS',
  ABUSE_MISUSE_DETECTION: 'ABUSE_MISUSE_DETECTION',
} as const;

export const TRIP_LOCATION_PATH = {
  TRIP_CREATE: 'trip-create',
  TRIP_FINALIZE: 'trip-finalize',
  TRIP_WAYPOINT_PERSIST: 'trip-waypoint-persist',
  TRIP_ROUTE_DERIVE: 'trip-route-derive',
  TRIP_ENRICH: 'trip-enrich',
  TRIP_RECONCILE: 'trip-reconcile',
  TRIP_BACKFILL: 'trip-backfill',
  TRIP_REPLAY: 'trip-replay',
  TRIP_LIST_READ: 'trip-list-read',
  TRIP_DETAIL_READ: 'trip-detail-read',
  TRIP_ROUTE_READ: 'trip-route-read',
  TRIP_TIMELINE_READ: 'trip-timeline-read',
  TRIP_BEHAVIOR_READ: 'trip-behavior-read',
  TRIP_ENERGY_READ: 'trip-energy-read',
  TRIP_EXPORT: 'trip-export',
  TRIP_HEATMAP: 'trip-heatmap',
} as const;

export const TRIP_LOCATION_SERVICE_IDENTITY = {
  TRIP_TRACKING_WORKER: 'synqdrive-trip-tracking-worker',
  TRIP_RECONCILIATION: 'synqdrive-trip-reconciliation',
  TRIP_ENRICH_WORKER: 'synqdrive-trip-enrich-worker',
  TRIP_BACKFILL_WORKER: 'synqdrive-trip-backfill-worker',
  TRIPS_LIST_API: 'synqdrive-trips-list',
  TRIPS_TIMELINE_API: 'synqdrive-trips-timeline',
  TRIPS_BEHAVIOR_API: 'synqdrive-trips-behavior-events',
  TRIPS_ENERGY_API: 'synqdrive-trips-energy-events',
  TRIPS_EXPORT_API: 'synqdrive-trips-export',
  ...LIVE_GPS_SERVICE_IDENTITY,
} as const;
