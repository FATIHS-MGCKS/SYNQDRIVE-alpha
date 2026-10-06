import type { P25ApdPolicyVersion } from './p25-apd-policy-versions';
import type { P25ApdCadenceProfileClass } from './p25-apd-profile-classifier';

/** Pre-poll shadow decision (APD-PS3). Post-fact fields live on outcome records only. */
export type P25ApdShadowDecisionKind =
  | 'WOULD_POLL'
  | 'WOULD_SKIP'
  | 'FORCED_FALLBACK'
  | 'FORCED_TRIP_SAFETY'
  | 'FORCED_PROFILE_INVALID'
  | 'FORCED_SOURCE_TIMESTAMP_MISSING'
  | 'FORCED_PROVIDER_GAP'
  | 'FORCED_RECONNECT'
  | 'FORCED_INSUFFICIENT_PROFILE'
  | 'NOT_ELIGIBLE_ACTIVE_TRIP'
  | 'IMMEDIATE_SNAPSHOT_REQUIRED';

export type P25ApdShadowDecisionReason =
  | 'RECONCILIATION_OFF_TRIP'
  | 'ACTIVE_TRIP_BYPASS'
  | 'PHASE_WINDOW_INSIDE_MIN_INTERVAL'
  | 'PHASE_WINDOW_OUTSIDE_HEARTBEAT'
  | 'NON_STABLE_FALLBACK_5M'
  | 'STABLE_PHASE_INSIDE_ALLOW'
  | 'STABLE_PHASE_OUTSIDE_5M'
  | 'PROFILE_OBSERVABILITY_GAP'
  | 'PROFILE_INSUFFICIENT_EVIDENCE'
  | 'MISSING_LV_SOURCE_TIMESTAMP'
  | 'R9_PROVIDER_WAKE'
  | 'SHADOW_NOT_EVALUATED';

export interface P25ApdShadowPrePollInput {
  organizationId: string;
  vehicleId: string;
  decisionAtMs: number;
  reconciliation: boolean;
  lastAllowedReconciliationPollMs: number;
  lastTrustworthyLvSourceMs: number | null;
  lastProviderFetchedAtMs: number | null;
  profileClass: P25ApdCadenceProfileClass;
  profileVersion: string;
  medianIntervalMs: number;
  tripFsmActive: boolean;
  providerGapOpen: boolean;
  r9WakePending: boolean;
}

export interface P25ApdShadowDecision {
  policyVersion: P25ApdPolicyVersion;
  decision: P25ApdShadowDecisionKind;
  reason: P25ApdShadowDecisionReason;
  expectedWindowStartMs: number | null;
  expectedWindowEndMs: number | null;
}
