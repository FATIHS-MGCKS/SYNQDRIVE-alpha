import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';
import { POLICY_RESOLVER_SOURCE_SYSTEM } from '../policy-resolver/policy-resolver.constants';

/** Canonical decision action for all telemetry ingest gates. */
export const TELEMETRY_INGEST_ACTION = AUTHORIZATION_DECISION_ACTION.INGEST;

/** Stable ingestion path identifiers for metrics and audit correlation. */
export const TELEMETRY_INGEST_PATH = {
  DIMO_SNAPSHOT_POLL: 'dimo-snapshot-poll',
  DIMO_DTC_POLL: 'dimo-dtc-poll',
  DIMO_DTC_WEBHOOK: 'dimo-dtc-webhook',
  DIMO_RPM_WEBHOOK: 'dimo-rpm-webhook',
  DIMO_CONNECTIVITY_WEBHOOK: 'dimo-connectivity-webhook',
  HM_TELEMETRY_MQTT: 'hm-telemetry-mqtt',
  HM_HEALTH_MQTT: 'hm-health-mqtt',
  HM_HEALTH_POLL: 'hm-health-poll',
  TRIP_BACKFILL: 'trip-backfill',
  TRIP_REPLAY: 'trip-replay',
  RAW_EVENT_STORE: 'raw-event-store',
  CLICKHOUSE_MIRROR: 'clickhouse-mirror',
} as const;

export type TelemetryIngestPath =
  (typeof TELEMETRY_INGEST_PATH)[keyof typeof TELEMETRY_INGEST_PATH];

/** Stable worker/service identities for ingest decision requests. */
export const TELEMETRY_INGEST_SERVICE_IDENTITY = {
  DIMO_SNAPSHOT_WORKER: 'synqdrive-dimo-snapshot-worker',
  DIMO_DTC_WORKER: 'synqdrive-dimo-dtc-worker',
  DIMO_WEBHOOK: 'synqdrive-dimo-webhook',
  HM_TELEMETRY_INGEST: 'synqdrive-hm-telemetry-ingest',
  HM_HEALTH_INGEST: 'synqdrive-hm-health-ingest',
  HM_HEALTH_POLL: 'synqdrive-hm-health-poll',
  TRIP_BACKFILL_WORKER: 'synqdrive-trip-backfill-worker',
  TRIP_REPLAY_WORKER: 'synqdrive-trip-replay-worker',
} as const;

export type TelemetryIngestServiceIdentity =
  (typeof TELEMETRY_INGEST_SERVICE_IDENTITY)[keyof typeof TELEMETRY_INGEST_SERVICE_IDENTITY];

/** Common telemetry data categories used at ingest boundaries. */
export const TELEMETRY_INGEST_DATA_CATEGORY = {
  TELEMETRY_DATA: 'TELEMETRY_DATA',
  GPS_LOCATION: 'GPS_LOCATION',
  HEALTH_SIGNALS: 'HEALTH_SIGNALS',
  DRIVING_BEHAVIOR: 'DRIVING_BEHAVIOR',
  DTC_CODES: 'DTC_CODES',
} as const;

export const TELEMETRY_INGEST_PURPOSE = {
  FLEET_ANALYTICS: 'FLEET_ANALYTICS',
  VEHICLE_HEALTH: 'VEHICLE_HEALTH',
  TRIPS: 'TRIPS',
  TECHNICAL_OVERVIEW: 'TECHNICAL_OVERVIEW',
  ALERTS: 'ALERTS',
} as const;

export const TELEMETRY_INGEST_SOURCE_SYSTEM = {
  DIMO: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
  HIGH_MOBILITY: 'HIGH_MOBILITY' as const,
} as const;
