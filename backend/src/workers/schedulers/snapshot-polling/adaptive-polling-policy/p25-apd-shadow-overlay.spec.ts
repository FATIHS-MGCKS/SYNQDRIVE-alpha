import { P25_APD_B2_V1 } from './p25-apd-policy-versions';
import {
  applyP25ApdShadowSafetyOverlay,
  mapProfileInvalidationToShadowOverlay,
} from './p25-apd-shadow-overlay';

const baseDecision = {
  policyVersion: P25_APD_B2_V1,
  decision: 'WOULD_SKIP' as const,
  reason: 'PHASE_WINDOW_OUTSIDE_HEARTBEAT' as const,
  expectedWindowStartMs: 1,
  expectedWindowEndMs: 2,
};

describe('p25-apd-shadow-overlay', () => {
  it('maps TRIP_ACTIVE profile invalidation to FORCED_TRIP_SAFETY / TRIP_ACTIVE', () => {
    expect(mapProfileInvalidationToShadowOverlay('TRIP_ACTIVE')).toEqual({
      decision: 'FORCED_TRIP_SAFETY',
      reason: 'TRIP_ACTIVE',
    });
  });

  it('maps insufficient evidence distinctly from observability gap', () => {
    expect(mapProfileInvalidationToShadowOverlay('INSUFFICIENT_RECENT_EVIDENCE')).toEqual({
      decision: 'FORCED_INSUFFICIENT_PROFILE',
      reason: 'PROFILE_INSUFFICIENT_EVIDENCE',
    });
  });

  it('trip authority disagreement blocks WOULD_SKIP without masking as PROFILE_OBSERVABILITY_GAP', () => {
    const out = applyP25ApdShadowSafetyOverlay(baseDecision, {
      r9WakeKnown: false,
      profileInvalidated: false,
      invalidationReason: null,
      providerGapOpen: false,
      sourceTimestampMissing: false,
      reconnectPending: false,
      tripAuthorityDisagreement: true,
    });
    expect(out.decision).toBe('FORCED_TRIP_SAFETY');
    expect(out.reason).toBe('TRIP_AUTHORITY_DISAGREEMENT');
  });

  it('source timestamp missing still wins before trip disagreement', () => {
    const out = applyP25ApdShadowSafetyOverlay(baseDecision, {
      r9WakeKnown: false,
      profileInvalidated: false,
      invalidationReason: null,
      providerGapOpen: false,
      sourceTimestampMissing: true,
      reconnectPending: false,
      tripAuthorityDisagreement: true,
    });
    expect(out.decision).toBe('FORCED_SOURCE_TIMESTAMP_MISSING');
  });
});
