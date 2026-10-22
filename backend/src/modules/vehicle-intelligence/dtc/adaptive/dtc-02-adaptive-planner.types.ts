import type { Dtc02TripVsiPlannerContext } from './dtc-02-adaptive-trip-vsi.types';

export type Dtc02ProviderCapability = 'dimo_linked' | 'unknown';

export type Dtc02WebhookEvidenceQuality =
  | 'none'
  | 'partial'
  | 'complete'
  | 'unknown'
  | 'stale';

export type Dtc02ProviderErrorState = 'none' | 'transient' | 'auth_denied' | 'unknown';

export type Dtc02PlannerEvidenceQuality = 'high' | 'medium' | 'low' | 'unknown';

export type Dtc02AdaptivePlannerInput = {
  registryLifecycle: string;
  providerCapability: Dtc02ProviderCapability;
  /** Last operational success timestamp (VLS lastDtcSuccessfulCheckAt). */
  lastSuccessfulDtcCheckAtMs: number | null;
  /** Source-head or VLS last poll fetch metadata. */
  lastPollFetchAtMs: number | null;
  lastConfirmedCompleteSourceAtMs: number | null;
  lastPartialWebhookSourceAtMs: number | null;
  webhookEvidenceQuality: Dtc02WebhookEvidenceQuality;
  hasActiveDtc: boolean;
  providerErrorState: Dtc02ProviderErrorState;
  evaluatedAtMs: number;
  /** P6 — when set, applies Trip FSM × VSI shadow overlay after P3 baseline plan. */
  tripVsiContext?: Dtc02TripVsiPlannerContext;
};

export type Dtc02AdaptivePlannerResult = {
  legacyNextCheckAtMs: number;
  proposedNextCheckAtMs: number;
  decisionReason: string;
  evidenceQuality: Dtc02PlannerEvidenceQuality;
  requiresLegacyFallback: boolean;
  safetyConstraints: string[];
  /** Projected spacing from evaluation time (shadow only). */
  projectedDeferMs: number;
  /** Positive when adaptive would defer relative to legacy next tick (projected). */
  projectedPollReductionMs: number;
  excluded: boolean;
  /** P6 shadow-only horizon (may exceed legacy 3h for evaluation metrics). */
  hypotheticalNextCheckAtMs?: number;
  hypotheticalPollReductionMs?: number;
  tripVsiPhase?: Dtc02TripVsiPlannerContext['tripPhase'];
  vsiDtcFreshness?: Dtc02TripVsiPlannerContext['vsiDtcFreshness'];
};
