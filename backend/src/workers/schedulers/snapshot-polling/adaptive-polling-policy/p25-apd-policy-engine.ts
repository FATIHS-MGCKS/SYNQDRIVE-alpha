import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
  type P25ApdPolicyVersion,
} from './p25-apd-policy-versions';
import type {
  P25ApdShadowDecision,
  P25ApdShadowPrePollInput,
} from './p25-apd-shadow-decision.types';

const MS_5M = 5 * 60_000;
const MS_10M = 10 * 60_000;
const MS_30M = 30 * 60_000;
const MS_1M = 60_000;

function phaseWindow(
  input: P25ApdShadowPrePollInput,
  halfWindowMs: number,
): { inside: boolean; expectedMs: number | null } {
  const med = input.medianIntervalMs;
  if (input.lastTrustworthyLvSourceMs == null || !med) {
    return { inside: false, expectedMs: null };
  }
  const expectedMs = input.lastTrustworthyLvSourceMs + med;
  return {
    inside: Math.abs(input.decisionAtMs - expectedMs) <= halfWindowMs,
    expectedMs,
  };
}

function windowBounds(expectedMs: number, halfWindowMs: number) {
  return {
    startMs: expectedMs - halfWindowMs,
    endMs: expectedMs + halfWindowMs,
  };
}

function baseGuards(
  policyVersion: P25ApdPolicyVersion,
  input: P25ApdShadowPrePollInput,
): P25ApdShadowDecision | null {
  if (input.r9WakePending) {
    return {
      policyVersion,
      decision: 'IMMEDIATE_SNAPSHOT_REQUIRED',
      reason: 'R9_PROVIDER_WAKE',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    };
  }
  if (input.tripFsmActive || !input.reconciliation) {
    return {
      policyVersion,
      decision: 'FORCED_TRIP_SAFETY',
      reason: 'ACTIVE_TRIP_BYPASS',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    };
  }
  if (input.providerGapOpen || input.profileClass === 'PROVIDER_OBSERVABILITY_GAP') {
    return {
      policyVersion,
      decision: 'FORCED_PROVIDER_GAP',
      reason: 'PROFILE_OBSERVABILITY_GAP',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    };
  }
  if (input.profileClass === 'INSUFFICIENT_EVIDENCE') {
    return {
      policyVersion,
      decision: 'FORCED_INSUFFICIENT_PROFILE',
      reason: 'PROFILE_INSUFFICIENT_EVIDENCE',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    };
  }
  if (input.lastTrustworthyLvSourceMs == null) {
    return {
      policyVersion,
      decision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
      reason: 'MISSING_LV_SOURCE_TIMESTAMP',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    };
  }
  return null;
}

function withPolicyVersion(
  policyVersion: P25ApdPolicyVersion,
  partial: Omit<P25ApdShadowDecision, 'policyVersion'>,
): P25ApdShadowDecision {
  return { policyVersion, ...partial };
}

/**
 * Frozen B2_HB10_IN1 — must match `buildPolicy('B2_HB10_IN1')` in replay core.
 */
export function evaluateP25ApdB2V1(
  input: P25ApdShadowPrePollInput,
): P25ApdShadowDecision {
  const guard = baseGuards(P25_APD_B2_V1, input);
  if (guard) return guard;

  const win = phaseWindow(input, MS_30M);
  const bounds =
    win.expectedMs != null ? windowBounds(win.expectedMs, MS_30M) : null;

  if (win.inside) {
    const allow =
      input.decisionAtMs - input.lastAllowedReconciliationPollMs >= MS_1M;
    return withPolicyVersion(P25_APD_B2_V1, {
      decision: allow ? 'WOULD_POLL' : 'WOULD_SKIP',
      reason: allow
        ? 'PHASE_WINDOW_INSIDE_MIN_INTERVAL'
        : 'PHASE_WINDOW_INSIDE_MIN_INTERVAL',
      expectedWindowStartMs: bounds?.startMs ?? null,
      expectedWindowEndMs: bounds?.endMs ?? null,
    });
  }

  const allowHb =
    input.decisionAtMs - input.lastAllowedReconciliationPollMs >= MS_10M;
  return withPolicyVersion(P25_APD_B2_V1, {
    decision: allowHb ? 'WOULD_POLL' : 'WOULD_SKIP',
    reason: 'PHASE_WINDOW_OUTSIDE_HEARTBEAT',
    expectedWindowStartMs: bounds?.startMs ?? null,
    expectedWindowEndMs: bounds?.endMs ?? null,
  });
}

/**
 * Frozen B4_PHASE_30M — must match `buildPolicy('B4_PHASE_30M')` in replay core.
 */
export function evaluateP25ApdB4V1(
  input: P25ApdShadowPrePollInput,
): P25ApdShadowDecision {
  const guard = baseGuards(P25_APD_B4_V1, input);
  if (guard) return guard;

  const win = phaseWindow(input, MS_30M);
  const bounds =
    win.expectedMs != null ? windowBounds(win.expectedMs, MS_30M) : null;

  if (input.profileClass !== 'STABLE_PERIODIC') {
    const allow =
      input.decisionAtMs - input.lastAllowedReconciliationPollMs >= MS_5M;
    return withPolicyVersion(P25_APD_B4_V1, {
      decision: allow ? 'WOULD_POLL' : 'WOULD_SKIP',
      reason: 'NON_STABLE_FALLBACK_5M',
      expectedWindowStartMs: bounds?.startMs ?? null,
      expectedWindowEndMs: bounds?.endMs ?? null,
    });
  }

  if (win.inside) {
    return withPolicyVersion(P25_APD_B4_V1, {
      decision: 'WOULD_POLL',
      reason: 'STABLE_PHASE_INSIDE_ALLOW',
      expectedWindowStartMs: bounds?.startMs ?? null,
      expectedWindowEndMs: bounds?.endMs ?? null,
    });
  }

  const allow =
    input.decisionAtMs - input.lastAllowedReconciliationPollMs >= MS_5M;
  return withPolicyVersion(P25_APD_B4_V1, {
    decision: allow ? 'WOULD_POLL' : 'WOULD_SKIP',
    reason: 'STABLE_PHASE_OUTSIDE_5M',
    expectedWindowStartMs: bounds?.startMs ?? null,
    expectedWindowEndMs: bounds?.endMs ?? null,
  });
}

export function evaluateP25ApdPolicy(
  policyVersion: P25ApdPolicyVersion,
  input: P25ApdShadowPrePollInput,
): P25ApdShadowDecision {
  if (policyVersion === P25_APD_B2_V1) return evaluateP25ApdB2V1(input);
  if (policyVersion === P25_APD_B4_V1) return evaluateP25ApdB4V1(input);
  throw new Error(`Unsupported policy version ${policyVersion}`);
}

/** Offline replay parity: boolean allow at poll start (non-trip reconciliation only). */
export function p25ApdReplayAllowPoll(
  policyVersion: P25ApdPolicyVersion,
  ctx: {
    reconciliation: boolean;
    lastAllowedMs: number;
    lastLvSourceMs: number | null;
    nowMs: number;
    profile: P25ApdShadowPrePollInput['profileClass'];
    medianIntervalMs: number;
  },
): boolean {
  if (!ctx.reconciliation) return true;
  const input: P25ApdShadowPrePollInput = {
    organizationId: '',
    vehicleId: '',
    decisionAtMs: ctx.nowMs,
    reconciliation: ctx.reconciliation,
    lastAllowedReconciliationPollMs: ctx.lastAllowedMs,
    lastTrustworthyLvSourceMs: ctx.lastLvSourceMs,
    lastProviderFetchedAtMs: null,
    profileClass: ctx.profile,
    profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
    medianIntervalMs: ctx.medianIntervalMs,
    tripFsmActive: false,
    providerGapOpen: ctx.profile === 'PROVIDER_OBSERVABILITY_GAP',
    r9WakePending: false,
  };
  const d = evaluateP25ApdPolicy(policyVersion, input);
  return (
    d.decision === 'WOULD_POLL' ||
    d.decision === 'IMMEDIATE_SNAPSHOT_REQUIRED' ||
    d.decision === 'FORCED_TRIP_SAFETY'
  );
}
