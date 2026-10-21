import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
  type P25ApdPolicyVersion,
} from './p25-apd-policy-versions';
import type { P25ApdCadenceProfileClass } from './p25-apd-profile-classifier';
import type {
  P25ApdShadowDecision,
  P25ApdShadowPrePollInput,
} from './p25-apd-shadow-decision.types';

const MS_5M = 5 * 60_000;
const MS_10M = 10 * 60_000;
const MS_30M = 30 * 60_000;
const MS_1M = 60_000;

function phaseWindow(
  input: Pick<
    P25ApdShadowPrePollInput,
    'decisionAtMs' | 'lastTrustworthyLvSourceMs' | 'medianIntervalMs'
  >,
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

function withPolicyVersion(
  policyVersion: P25ApdPolicyVersion,
  partial: Omit<P25ApdShadowDecision, 'policyVersion'>,
): P25ApdShadowDecision {
  return { policyVersion, ...partial };
}

/**
 * Frozen B2 — matches `buildPolicy('B2_HB10_IN1')` in replay core (profile not used).
 */
export function evaluateP25ApdB2V1Core(
  input: P25ApdShadowPrePollInput,
): P25ApdShadowDecision {
  if (!input.reconciliation) {
    return withPolicyVersion(P25_APD_B2_V1, {
      decision: 'FORCED_TRIP_SAFETY',
      reason: 'ACTIVE_TRIP_BYPASS',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    });
  }

  const win = phaseWindow(input, MS_30M);
  const bounds =
    win.expectedMs != null ? windowBounds(win.expectedMs, MS_30M) : null;

  if (win.inside) {
    const allow =
      input.decisionAtMs - input.lastAllowedReconciliationPollMs >= MS_1M;
    return withPolicyVersion(P25_APD_B2_V1, {
      decision: allow ? 'WOULD_POLL' : 'WOULD_SKIP',
      reason: 'PHASE_WINDOW_INSIDE_MIN_INTERVAL',
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
 * Frozen B4 — matches `buildPolicy('B4_PHASE_30M')` in replay core.
 */
export function evaluateP25ApdB4V1Core(
  input: P25ApdShadowPrePollInput,
): P25ApdShadowDecision {
  if (!input.reconciliation) {
    return withPolicyVersion(P25_APD_B4_V1, {
      decision: 'FORCED_TRIP_SAFETY',
      reason: 'ACTIVE_TRIP_BYPASS',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    });
  }

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

export function evaluateP25ApdPolicyCore(
  policyVersion: P25ApdPolicyVersion,
  input: P25ApdShadowPrePollInput,
): P25ApdShadowDecision {
  if (policyVersion === P25_APD_B2_V1) return evaluateP25ApdB2V1Core(input);
  if (policyVersion === P25_APD_B4_V1) return evaluateP25ApdB4V1Core(input);
  throw new Error(`Unsupported policy version ${policyVersion}`);
}

/** Offline replay parity: boolean allow at poll start. */
export function p25ApdReplayAllowPoll(
  policyVersion: P25ApdPolicyVersion,
  ctx: {
    reconciliation: boolean;
    lastAllowedMs: number;
    lastLvSourceMs: number | null;
    nowMs: number;
    profile: P25ApdCadenceProfileClass;
    medianIntervalMs: number;
  },
): boolean {
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
    providerGapOpen: false,
    r9WakePending: false,
  };
  const d = evaluateP25ApdPolicyCore(policyVersion, input);
  return (
    d.decision === 'WOULD_POLL' ||
    d.decision === 'FORCED_TRIP_SAFETY' ||
    d.decision === 'IMMEDIATE_SNAPSHOT_REQUIRED'
  );
}
