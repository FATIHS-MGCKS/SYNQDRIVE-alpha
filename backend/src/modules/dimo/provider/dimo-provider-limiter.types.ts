import type {
  DimoProviderLimiterMode,
  DimoProviderRateAlgorithm,
} from '@config/dimo-provider-limiter.config';

export enum DimoProviderLimiterDecision {
  ALLOW = 'allow',
  WOULD_WAIT = 'would_wait',
  WOULD_REJECT = 'would_reject',
  BYPASS = 'bypass',
  ERROR_FAIL_OPEN = 'error_fail_open',
}

export enum DimoProviderRequestCategory {
  TELEMETRY_GRAPHQL = 'telemetry_graphql',
  SNAPSHOT = 'snapshot',
  ACTIVE_TRIP_TRACKING = 'active_trip_tracking',
  RECONCILIATION_SEGMENTS = 'reconciliation_segments',
  RECHARGE_SEGMENTS = 'recharge_segments',
  DTC = 'dtc',
  VEHICLE_SYNC = 'vehicle_sync',
  ENRICHMENT = 'enrichment',
  VEHICLE_SUMMARY = 'vehicle_summary',
  VEHICLE_VIN = 'vehicle_vin',
  OTHER = 'other',
}

export enum DimoProviderRequestPriority {
  /** Auth recovery / service-critical provider access. */
  P0_CRITICAL = 'p0_critical',
  /** Active-trip / live-driving telemetry. */
  P1_LIVE = 'p1_live',
  /** User-triggered interactive vehicle detail / recent telemetry. */
  P2_INTERACTIVE = 'p2_interactive',
  /** Regular snapshot polling / normal connected refresh. */
  P3_NORMAL = 'p3_normal',
  /** Reconciliation, enrichment, DTC, non-urgent sync. */
  P4_BACKGROUND = 'p4_background',
}

export interface DimoProviderLimiterBeginInput {
  mode: DimoProviderLimiterMode;
  category: DimoProviderRequestCategory;
  priority: DimoProviderRequestPriority;
  rateLimitPerSecond: number;
  rateBurst: number;
  rateAlgorithm: DimoProviderRateAlgorithm;
  maxInFlight: number;
  inFlightLeaseMs: number;
  reservedHighPrioritySlots: number;
}

export interface DimoProviderLimiterBeginResult {
  leaseId: string | null;
  /** ZSET member for release (rank:leaseId) when lease acquired. */
  inFlightMember: string | null;
  mode: DimoProviderLimiterMode;
  rateDecision: DimoProviderLimiterDecision;
  inFlightDecision: DimoProviderLimiterDecision;
  rateWindowCount: number;
  rateWindowLimit: number;
  inFlightCount: number;
  inFlightLimit: number;
  redisFailOpen: boolean;
  /** Remaining tokens after rate decision (token bucket only). */
  tokensRemaining?: number;
  rateAlgorithm?: DimoProviderRateAlgorithm;
  /** Estimated wait if decision is WOULD_WAIT (cooldown or contention). */
  wouldDelayMs?: number;
  providerCooldownActive?: boolean;
}

export type DimoProviderHttpStatusClass =
  | 'success'
  | 'client_error'
  | 'auth_error'
  | 'forbidden'
  | 'rate_limited'
  | 'server_error'
  | 'timeout'
  | 'network_error'
  | 'unknown';

export interface DimoProviderHttpObservation {
  statusClass: DimoProviderHttpStatusClass;
  httpStatus?: number;
  retryAfterSeconds?: number;
}
