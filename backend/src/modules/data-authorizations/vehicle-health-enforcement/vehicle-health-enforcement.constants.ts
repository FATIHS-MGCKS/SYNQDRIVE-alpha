import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';

export const VEHICLE_HEALTH_ACTION = {
  INGEST: AUTHORIZATION_DECISION_ACTION.INGEST,
  DERIVE: AUTHORIZATION_DECISION_ACTION.DERIVE,
  READ: AUTHORIZATION_DECISION_ACTION.READ,
  EXPORT: AUTHORIZATION_DECISION_ACTION.EXPORT,
  USE_FOR_AI: AUTHORIZATION_DECISION_ACTION.USE_FOR_AI,
} as const;

/** Distinct health data categories — no blanket org-wide allow. */
export const VEHICLE_HEALTH_DATA_CATEGORY = {
  HEALTH_SIGNALS: 'HEALTH_SIGNALS',
  DTC_CODES: 'DTC_CODES',
} as const;

export const VEHICLE_HEALTH_PURPOSE = {
  VEHICLE_HEALTH: 'VEHICLE_HEALTH',
  ALERTS: 'ALERTS',
  DOCUMENT_PROCESSING: 'DOCUMENT_PROCESSING',
  FLEET_ANALYTICS: 'FLEET_ANALYTICS',
  /** Profiling / misuse detection — separate from maintenance. */
  PROFILING: 'ABUSE_MISUSE_DETECTION',
} as const;

export const VEHICLE_HEALTH_OBSERVATION_SOURCE = {
  TELEMETRY: 'TELEMETRY',
  MANUAL: 'MANUAL',
} as const;

export const VEHICLE_HEALTH_PATH = {
  DTC_INGEST: 'dtc-ingest',
  DTC_READ: 'dtc-read',
  DTC_DERIVE: 'dtc-derive',
  DTC_AI: 'dtc-ai',
  BATTERY_INGEST: 'battery-ingest',
  BATTERY_DERIVE: 'battery-derive',
  BATTERY_READ: 'battery-read',
  TIRE_DERIVE: 'tire-derive',
  TIRE_READ: 'tire-read',
  TIRE_ALERT: 'tire-alert',
  BRAKE_DERIVE: 'brake-derive',
  BRAKE_READ: 'brake-read',
  BRAKE_ALERT: 'brake-alert',
  SERVICE_DERIVE: 'service-derive',
  SERVICE_READ: 'service-read',
  HEALTH_SUMMARY_READ: 'health-summary-read',
  HEALTH_AI: 'health-ai',
  HEALTH_EXPORT: 'health-export',
  MANUAL_OBSERVATION: 'manual-observation',
  TELEMETRY_OBSERVATION: 'telemetry-observation',
} as const;

export const VEHICLE_HEALTH_SERVICE_IDENTITY = {
  DTC_WORKER: 'synqdrive-dtc-worker',
  DTC_API: 'synqdrive-dtc-api',
  DTC_AI: 'synqdrive-dtc-ai',
  BATTERY_WORKER: 'synqdrive-battery-v2-worker',
  BATTERY_API: 'synqdrive-battery-api',
  TIRE_WORKER: 'synqdrive-tire-recalc-worker',
  TIRE_API: 'synqdrive-tire-api',
  BRAKE_WORKER: 'synqdrive-brake-recalc-worker',
  BRAKE_API: 'synqdrive-brake-api',
  HEALTH_API: 'synqdrive-health-api',
  HEALTH_AI: 'synqdrive-health-ai',
  HEALTH_ALERT: 'synqdrive-health-alert',
  SERVICE_API: 'synqdrive-service-api',
  HEALTH_EXPORT: 'synqdrive-health-export',
} as const;
