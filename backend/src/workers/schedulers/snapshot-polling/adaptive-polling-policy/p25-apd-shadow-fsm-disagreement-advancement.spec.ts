import { P25_APD_B2_V1 } from './p25-apd-policy-versions';
import { applyP25ApdShadowSafetyOverlay } from './p25-apd-shadow-overlay';
import { isApdShadowAdvancingDecision } from '../adaptive-polling-shadow/p25-apd-shadow-execution-versions';

/**
 * Simulates two consecutive reconciliation polls under persistent FSM/interval disagreement.
 * WOULD_POLL may advance lastAllowed on SUCCESS; a later core WOULD_SKIP must not survive.
 */
describe('FSM disagreement and lastAllowed advancement safety', () => {
  const disagreementOverlay = {
    r9WakeKnown: false,
    profileInvalidated: false,
    invalidationReason: null,
    providerGapOpen: false,
    sourceTimestampMissing: false,
    reconnectPending: false,
    tripAuthorityDisagreement: true,
  };

  it('WOULD_POLL under disagreement remains advancing-eligible', () => {
    const poll = applyP25ApdShadowSafetyOverlay(
      {
        policyVersion: P25_APD_B2_V1,
        decision: 'WOULD_POLL',
        reason: 'NON_STABLE_FALLBACK_5M',
        expectedWindowStartMs: 1,
        expectedWindowEndMs: 2,
      },
      disagreementOverlay,
    );
    expect(poll.decision).toBe('WOULD_POLL');
    expect(isApdShadowAdvancingDecision(poll.decision)).toBe(true);
  });

  it('after advancing poll, subsequent core WOULD_SKIP is blocked (fail-closed)', () => {
    const skip = applyP25ApdShadowSafetyOverlay(
      {
        policyVersion: P25_APD_B2_V1,
        decision: 'WOULD_SKIP',
        reason: 'PHASE_WINDOW_OUTSIDE_HEARTBEAT',
        expectedWindowStartMs: 1,
        expectedWindowEndMs: 2,
      },
      disagreementOverlay,
    );
    expect(skip.decision).toBe('NOT_ELIGIBLE_ACTIVE_TRIP');
    expect(skip.reason).toBe('TRIP_AUTHORITY_DISAGREEMENT');
    expect(isApdShadowAdvancingDecision(skip.decision)).toBe(false);
  });
});
