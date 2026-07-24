import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';

export const NOTIFICATION_ENFORCEMENT_ACTION = {
  NOTIFY: AUTHORIZATION_DECISION_ACTION.NOTIFY,
} as const;

/** Separates technical monitoring from user-facing business notifications. */
export const NOTIFICATION_GATE_KIND = {
  /** Bookings, handovers, billing, compliance — tenant scope only. */
  OPERATIONAL: 'OPERATIONAL',
  /** System/integration monitoring — no privacy-derived data. */
  TECHNICAL_MONITORING: 'TECHNICAL_MONITORING',
  /** Vehicle health / DTC / technical observations. */
  HEALTH_ALERT: 'HEALTH_ALERT',
  /** Driving behavior, misuse, assessment quality. */
  DRIVING_ALERT: 'DRIVING_ALERT',
  /** GPS / telemetry connectivity / offline. */
  CONNECTIVITY_ALERT: 'CONNECTIVITY_ALERT',
} as const;

export type NotificationGateKind =
  (typeof NOTIFICATION_GATE_KIND)[keyof typeof NOTIFICATION_GATE_KIND];

export const NOTIFICATION_ENFORCEMENT_PATH = {
  NOTIFICATION_INGEST: 'notification-ingest',
  NOTIFICATION_DELIVERY: 'notification-delivery',
  NOTIFICATION_DEEP_LINK: 'notification-deep-link',
  NOTIFICATION_TASK_BRIDGE: 'notification-task-bridge',
  NOTIFICATION_REVOCATION: 'notification-revocation',
  CONNECTIVITY_NOTIFY: 'connectivity-notify',
} as const;

export const NOTIFICATION_ENFORCEMENT_SERVICE_IDENTITY = {
  NOTIFICATION_CORE: 'synqdrive-notification-core',
  NOTIFICATION_DELIVERY: 'synqdrive-notification-delivery',
  NOTIFICATION_API: 'synqdrive-notification-api',
  NOTIFICATION_TASK_BRIDGE: 'synqdrive-notification-task-bridge',
  CONNECTIVITY_NOTIFY: 'synqdrive-connectivity-notify',
} as const;

/** Internal template param keys — never shown in previews. */
export const NOTIFICATION_AUTH_TEMPLATE_PREFIX = '_auth';

export const NOTIFICATION_AUTH_DENY_REASON = {
  INGEST_DENIED: 'NOTIFICATION_INGEST_DENIED',
  DELIVERY_DENIED: 'NOTIFICATION_DELIVERY_DENIED',
  DEEP_LINK_DENIED: 'NOTIFICATION_DEEP_LINK_DENIED',
  REVOKED: 'NOTIFICATION_REVOKED',
  TENANT_MISMATCH: 'NOTIFICATION_TENANT_MISMATCH',
  DERIVED_DATA_BLOCKED: 'NOTIFICATION_DERIVED_DATA_BLOCKED',
} as const;
