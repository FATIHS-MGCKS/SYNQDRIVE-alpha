import {
  DTC02_MIN_SHADOW_INTERVAL_MS,
  DTC02_STANDBY_RECONCILE_INTERVAL_MS,
  DTC02_TRIP_POLL_COALESCE_MS,
} from './dtc-02-adaptive-planner.constants';
import type { Dtc02AdaptivePlannerInput, Dtc02AdaptivePlannerResult } from './dtc-02-adaptive-planner.types';
import type { Dtc02TripVsiPlannerContext } from './dtc-02-adaptive-trip-vsi.types';

function withinCoalesceWindow(
  lastPollOrIntentAtMs: number | null,
  evaluatedAtMs: number,
): boolean {
  if (lastPollOrIntentAtMs == null) return false;
  const age = evaluatedAtMs - lastPollOrIntentAtMs;
  return age >= 0 && age < DTC02_TRIP_POLL_COALESCE_MS;
}

/**
 * P6 shadow overlay — adjusts projected poll timing using Trip FSM + VSI freshness.
 * Does not enqueue polls or mutate episodes; hypothetical horizon may exceed legacy 3h.
 */
export function applyDtc02P6TripVsiShadowOverlay(
  base: Dtc02AdaptivePlannerResult,
  plannerInput: Dtc02AdaptivePlannerInput,
  tripVsi: Dtc02TripVsiPlannerContext,
): Dtc02AdaptivePlannerResult {
  const safetyConstraints = [...base.safetyConstraints, 'P6_TRIP_VSI_SHADOW_OVERLAY'];
  let proposed = base.proposedNextCheckAtMs;
  let decisionReason = base.decisionReason;
  let requiresLegacyFallback = base.requiresLegacyFallback;
  const anchorSuccess =
    plannerInput.lastSuccessfulDtcCheckAtMs ?? plannerInput.evaluatedAtMs;
  let hypotheticalNextCheckAtMs =
    base.hypotheticalNextCheckAtMs ?? base.proposedNextCheckAtMs;

  if (tripVsi.tripAuthorityDisagreement || tripVsi.tripPhase === 'UNKNOWN') {
    return {
      ...base,
      proposedNextCheckAtMs: base.legacyNextCheckAtMs,
      decisionReason: 'P6_FAIL_CLOSED_TRIP_AUTHORITY_DISAGREEMENT',
      requiresLegacyFallback: true,
      safetyConstraints: [...safetyConstraints, 'FAIL_CLOSED_TRIP_FSM_DISAGREEMENT'],
      hypotheticalNextCheckAtMs: base.legacyNextCheckAtMs,
      tripVsiPhase: tripVsi.tripPhase,
      vsiDtcFreshness: tripVsi.vsiDtcFreshness,
      projectedDeferMs: base.legacyNextCheckAtMs - plannerInput.evaluatedAtMs,
      projectedPollReductionMs: 0,
    };
  }

  if (tripVsi.vsiDtcFreshness === 'UNKNOWN') {
    return {
      ...base,
      proposedNextCheckAtMs: base.legacyNextCheckAtMs,
      decisionReason: 'P6_FAIL_CLOSED_VSI_DTC_FRESHNESS_UNKNOWN',
      requiresLegacyFallback: true,
      safetyConstraints: [...safetyConstraints, 'FAIL_CLOSED_VSI_UNKNOWN'],
      hypotheticalNextCheckAtMs: base.legacyNextCheckAtMs,
      tripVsiPhase: tripVsi.tripPhase,
      vsiDtcFreshness: tripVsi.vsiDtcFreshness,
      projectedDeferMs: base.legacyNextCheckAtMs - plannerInput.evaluatedAtMs,
      projectedPollReductionMs: 0,
    };
  }

  if (tripVsi.vsiDtcFreshness === 'STALE') {
    safetyConstraints.push('P6_PROVIDER_STALE_AWAIT_ACTIVITY');
    decisionReason = 'P6_VSI_STALE_NO_REPEAT_POLL';
    proposed = base.legacyNextCheckAtMs;
    hypotheticalNextCheckAtMs = base.legacyNextCheckAtMs;
    requiresLegacyFallback = true;
  } else if (tripVsi.tripPhase === 'TRIP_ACTIVE') {
    safetyConstraints.push('P6_TRIP_ACTIVE_WEBHOOK_FIRST');
    decisionReason = 'P6_TRIP_ACTIVE_WEBHOOK_FIRST_SHADOW';
    proposed = base.legacyNextCheckAtMs;
    hypotheticalNextCheckAtMs = base.legacyNextCheckAtMs;
  } else if (
    (tripVsi.tripPhase === 'TRIP_START' || tripVsi.tripPhase === 'TRIP_END') &&
    !withinCoalesceWindow(tripVsi.lastPollOrIntentAtMs, plannerInput.evaluatedAtMs)
  ) {
    const minAt = plannerInput.evaluatedAtMs + DTC02_MIN_SHADOW_INTERVAL_MS;
    proposed = Math.min(base.legacyNextCheckAtMs, minAt);
    hypotheticalNextCheckAtMs = proposed;
    decisionReason =
      tripVsi.tripPhase === 'TRIP_START'
        ? 'P6_TRIP_START_AFTER_VSI_FRESH_GATE'
        : 'P6_TRIP_END_RECONCILE_AFTER_VSI_FRESH_GATE';
    safetyConstraints.push('P6_TRIP_BOUNDARY_MIN_SPACING');
  } else if (
    (tripVsi.tripPhase === 'TRIP_START' || tripVsi.tripPhase === 'TRIP_END') &&
    withinCoalesceWindow(tripVsi.lastPollOrIntentAtMs, plannerInput.evaluatedAtMs)
  ) {
    decisionReason = 'P6_TRIP_BOUNDARY_COALESCED_WITH_RECENT_POLL';
    proposed = base.legacyNextCheckAtMs;
    hypotheticalNextCheckAtMs = base.legacyNextCheckAtMs;
    safetyConstraints.push('P6_NO_DOUBLE_START_END_SHORT_TRIP');
  } else if (tripVsi.tripPhase === 'STANDBY' && base.decisionReason.includes('FRESH_CONFIRMED')) {
    const standbyHypothetical = anchorSuccess + DTC02_STANDBY_RECONCILE_INTERVAL_MS;
    hypotheticalNextCheckAtMs = Math.max(base.proposedNextCheckAtMs, standbyHypothetical);
    decisionReason = 'P6_STANDBY_FRESH_DATA_24H_HYPOTHETICAL';
    safetyConstraints.push('P6_STANDBY_24H_POLICY_HYPOTHETICAL_ONLY');
    proposed = base.proposedNextCheckAtMs;
  }

  proposed = Math.min(proposed, base.legacyNextCheckAtMs);

  const projectedDeferMs = proposed - plannerInput.evaluatedAtMs;
  const projectedPollReductionMs = proposed - base.legacyNextCheckAtMs;
  const hypotheticalPollReductionMs =
    hypotheticalNextCheckAtMs - base.legacyNextCheckAtMs;

  return {
    ...base,
    proposedNextCheckAtMs: proposed,
    decisionReason,
    requiresLegacyFallback,
    safetyConstraints,
    projectedDeferMs,
    projectedPollReductionMs,
    hypotheticalNextCheckAtMs,
    hypotheticalPollReductionMs,
    tripVsiPhase: tripVsi.tripPhase,
    vsiDtcFreshness: tripVsi.vsiDtcFreshness,
  };
}
