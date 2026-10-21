import { P25_APD_B2_V1 } from './p25-apd-policy-versions';
import { applyP25ApdShadowSafetyOverlay } from './p25-apd-shadow-overlay';
import {
  isApdShadowAdvancingDecision,
  isApdShadowSimulatedLvSourceDecision,
} from '../adaptive-polling-shadow/p25-apd-shadow-execution-versions';

const skipCore = {
  policyVersion: P25_APD_B2_V1,
  decision: 'WOULD_SKIP' as const,
  reason: 'PHASE_WINDOW_OUTSIDE_HEARTBEAT' as const,
  expectedWindowStartMs: 1,
  expectedWindowEndMs: 2,
};

const pollCore = {
  ...skipCore,
  decision: 'WOULD_POLL' as const,
};

describe('p25-apd-shadow-overlay priority and advancement', () => {
  it('trip disagreement replaces WOULD_SKIP with non-advancing NOT_ELIGIBLE_ACTIVE_TRIP', () => {
    const out = applyP25ApdShadowSafetyOverlay(skipCore, {
      r9WakeKnown: false,
      profileInvalidated: false,
      invalidationReason: null,
      providerGapOpen: false,
      sourceTimestampMissing: false,
      reconnectPending: false,
      tripAuthorityDisagreement: true,
    });
    expect(out).toMatchObject({
      decision: 'NOT_ELIGIBLE_ACTIVE_TRIP',
      reason: 'TRIP_AUTHORITY_DISAGREEMENT',
    });
    expect(isApdShadowAdvancingDecision(out.decision)).toBe(false);
    expect(isApdShadowSimulatedLvSourceDecision(out.decision)).toBe(false);
  });

  it('trip disagreement does not downgrade WOULD_POLL', () => {
    const out = applyP25ApdShadowSafetyOverlay(pollCore, {
      r9WakeKnown: false,
      profileInvalidated: false,
      invalidationReason: null,
      providerGapOpen: false,
      sourceTimestampMissing: false,
      reconnectPending: false,
      tripAuthorityDisagreement: true,
    });
    expect(out.decision).toBe('WOULD_POLL');
  });

  it('overlay priority: R9 > missing LV > provider gap > reconnect > profile > trip disagreement', () => {
    const full = {
      r9WakeKnown: true,
      profileInvalidated: true,
      invalidationReason: 'INSUFFICIENT_RECENT_EVIDENCE' as const,
      providerGapOpen: true,
      sourceTimestampMissing: true,
      reconnectPending: true,
      tripAuthorityDisagreement: true,
    };
    expect(applyP25ApdShadowSafetyOverlay(skipCore, full).reason).toBe('R9_PROVIDER_WAKE');

    expect(
      applyP25ApdShadowSafetyOverlay(skipCore, { ...full, r9WakeKnown: false }).decision,
    ).toBe('FORCED_SOURCE_TIMESTAMP_MISSING');

    expect(
      applyP25ApdShadowSafetyOverlay(skipCore, {
        ...full,
        r9WakeKnown: false,
        sourceTimestampMissing: false,
      }).decision,
    ).toBe('FORCED_PROVIDER_GAP');

    expect(
      applyP25ApdShadowSafetyOverlay(skipCore, {
        ...full,
        r9WakeKnown: false,
        sourceTimestampMissing: false,
        providerGapOpen: false,
      }).decision,
    ).toBe('FORCED_RECONNECT');

    expect(
      applyP25ApdShadowSafetyOverlay(skipCore, {
        ...full,
        r9WakeKnown: false,
        sourceTimestampMissing: false,
        providerGapOpen: false,
        reconnectPending: false,
      }).reason,
    ).toBe('PROFILE_INSUFFICIENT_EVIDENCE');
  });
});
