import type { DimoProviderLimiterMode } from '@config/dimo-provider-limiter.config';

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
  P0_CRITICAL = 'p0_critical',
  P1_HIGH = 'p1_high',
  P2_NORMAL = 'p2_normal',
  P3_BACKGROUND = 'p3_background',
}

export interface DimoProviderLimiterBeginInput {
  mode: DimoProviderLimiterMode;
  category: DimoProviderRequestCategory;
  priority: DimoProviderRequestPriority;
  rateLimitPerSecond: number;
  rateBurst: number;
  maxInFlight: number;
  inFlightLeaseMs: number;
}

export interface DimoProviderLimiterBeginResult {
  leaseId: string | null;
  mode: DimoProviderLimiterMode;
  rateDecision: DimoProviderLimiterDecision;
  inFlightDecision: DimoProviderLimiterDecision;
  rateWindowCount: number;
  rateWindowLimit: number;
  inFlightCount: number;
  inFlightLimit: number;
  redisFailOpen: boolean;
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
