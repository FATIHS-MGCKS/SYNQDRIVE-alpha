import { POLICY_RESOLVER_ACTION, POLICY_RESOLVER_REASON } from '../policy-resolver/policy-resolver.constants';

/** Decision engine contract version — bump on breaking output changes. */
export const AUTHORIZATION_DECISION_ENGINE_VERSION = '1.0.0';

/** Supported operational actions — explicit enum, no empty = ANY. */
export const AUTHORIZATION_DECISION_ACTION = {
  INGEST: 'INGEST',
  READ: 'READ',
  WRITE: 'WRITE',
  DERIVE: 'DERIVE',
  PROFILE: 'PROFILE',
  EXPORT: 'EXPORT',
  SHARE: 'SHARE',
  DELETE: 'DELETE',
  NOTIFY: 'NOTIFY',
  USE_FOR_AI: 'USE_FOR_AI',
} as const;

export type AuthorizationDecisionAction =
  (typeof AUTHORIZATION_DECISION_ACTION)[keyof typeof AUTHORIZATION_DECISION_ACTION];

export const AUTHORIZATION_DECISION_ACTION_VALUES = Object.values(AUTHORIZATION_DECISION_ACTION);

/** Operational outcomes exposed to callers — shadow is explicit, never silent. */
export const AUTHORIZATION_DECISION_OUTCOME = {
  ALLOW: 'ALLOW',
  DENY: 'DENY',
  SHADOW_WOULD_DENY: 'SHADOW_WOULD_DENY',
} as const;

export type AuthorizationDecisionOutcome =
  (typeof AUTHORIZATION_DECISION_OUTCOME)[keyof typeof AUTHORIZATION_DECISION_OUTCOME];

/** Maps decision actions to policy-resolver actions without duplicating policy logic. */
export const DECISION_TO_RESOLVER_ACTION: Record<
  AuthorizationDecisionAction,
  (typeof POLICY_RESOLVER_ACTION)[keyof typeof POLICY_RESOLVER_ACTION]
> = {
  INGEST: POLICY_RESOLVER_ACTION.INGEST,
  READ: POLICY_RESOLVER_ACTION.READ,
  WRITE: POLICY_RESOLVER_ACTION.WRITE,
  SHARE: POLICY_RESOLVER_ACTION.SHARE,
  DERIVE: POLICY_RESOLVER_ACTION.PROCESS,
  PROFILE: POLICY_RESOLVER_ACTION.PROCESS,
  EXPORT: POLICY_RESOLVER_ACTION.SHARE,
  DELETE: POLICY_RESOLVER_ACTION.WRITE,
  NOTIFY: POLICY_RESOLVER_ACTION.PROCESS,
  USE_FOR_AI: POLICY_RESOLVER_ACTION.PROCESS,
};

/** Decision-layer reason codes — extends resolver reasons with fail-closed codes. */
export const AUTHORIZATION_DECISION_REASON = {
  ...POLICY_RESOLVER_REASON,
  REQUEST_INVALID: 'REQUEST_INVALID',
  MISSING_CORRELATION_ID: 'MISSING_CORRELATION_ID',
  MISSING_PROCESSOR_IDENTITY: 'MISSING_PROCESSOR_IDENTITY',
  MISSING_RESOURCE_SCOPE: 'MISSING_RESOURCE_SCOPE',
  UNKNOWN_DATA_CATEGORY: 'UNKNOWN_DATA_CATEGORY',
  UNKNOWN_PROCESSOR: 'UNKNOWN_PROCESSOR',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  RESOLVER_ERROR: 'RESOLVER_ERROR',
  POLICY_UNCLEAR: 'POLICY_UNCLEAR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  GLOBAL_DENY_SWITCH: 'GLOBAL_DENY_SWITCH',
  DENY_SWITCH_ACTIVE: 'DENY_SWITCH_ACTIVE',
  DENY_SWITCH_NOT_READY: 'DENY_SWITCH_NOT_READY',
  DEVELOPMENT_BYPASS: 'DEVELOPMENT_BYPASS',
  POLICY_MATCH: 'POLICY_MATCH',
} as const;

export type AuthorizationDecisionReasonCode =
  (typeof AUTHORIZATION_DECISION_REASON)[keyof typeof AUTHORIZATION_DECISION_REASON];

/** Known provider platform identities — empty identity is never ANY. */
export const AUTHORIZATION_KNOWN_PROVIDER_IDENTITIES = new Set([
  'DIMO',
  'HIGH_MOBILITY',
  'SYNQDRIVE',
  'SYNQDRIVE_PLATFORM',
]);

/** Known internal service identities for processor validation. */
export const AUTHORIZATION_KNOWN_SERVICE_IDENTITIES = new Set([
  'synqdrive-platform',
  'synqdrive-ingestion',
  'synqdrive-worker',
  'synqdrive-api',
  'dimo-telemetry',
  'high-mobility',
  'synqdrive-dimo-snapshot-worker',
  'synqdrive-dimo-dtc-worker',
  'synqdrive-dimo-webhook',
  'synqdrive-hm-telemetry-ingest',
  'synqdrive-hm-health-ingest',
  'synqdrive-hm-health-poll',
  'synqdrive-trip-backfill-worker',
  'synqdrive-trip-replay-worker',
  'synqdrive-trip-tracking-worker',
  'synqdrive-trip-reconciliation',
  'synqdrive-trip-enrich-worker',
  'synqdrive-trips-list',
  'synqdrive-trips-timeline',
  'synqdrive-trips-behavior-events',
  'synqdrive-trips-energy-events',
  'synqdrive-trips-export',
  'synqdrive-dtc-api',
  'synqdrive-dtc-ai',
  'synqdrive-battery-v2-worker',
  'synqdrive-battery-api',
  'synqdrive-tire-recalc-worker',
  'synqdrive-tire-api',
  'synqdrive-brake-recalc-worker',
  'synqdrive-brake-api',
  'synqdrive-health-api',
  'synqdrive-health-ai',
  'synqdrive-health-alert',
  'synqdrive-service-api',
  'synqdrive-health-export',
  'synqdrive-behavior-enrich-worker',
  'synqdrive-driving-impact-worker',
  'synqdrive-misuse-reconcile',
  'synqdrive-driver-score-api',
  'synqdrive-trip-decision-api',
  'synqdrive-trip-assessment-worker',
  'synqdrive-booking-risk-worker',
  'synqdrive-behavior-read-api',
  'synqdrive-behavior-export-api',
  'synqdrive-behavior-ai',
  'synqdrive-behavior-notify',
  'synqdrive-notification-core',
  'synqdrive-notification-delivery',
  'synqdrive-notification-api',
  'synqdrive-notification-task-bridge',
  'synqdrive-connectivity-notify',
]);

/** Default cache TTL for high-frequency ingestion paths (ms). */
export const AUTHORIZATION_DECISION_DEFAULT_CACHE_TTL_MS = 30_000;

/** Default max in-memory cache entries. */
export const AUTHORIZATION_DECISION_DEFAULT_CACHE_MAX_ENTRIES = 10_000;
