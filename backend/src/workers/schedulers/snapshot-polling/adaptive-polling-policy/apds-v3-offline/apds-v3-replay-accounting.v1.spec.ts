import { classifyV3ReplayPhysicalAccounting } from './apds-v3-replay-accounting.v1';
import type { ApdsV3OfflinePolicyDecision } from './apds-v3-offline.types';
import type { P25ApdShadowDecision } from '../p25-apd-shadow-decision.types';

const skipBoth = (v3: ApdsV3OfflinePolicyDecision) =>
  classifyV3ReplayPhysicalAccounting({
    baselineDue: true,
    v3,
    b2: {
      policyVersion: 'P25_APD_B2_V1',
      decision: 'WOULD_SKIP',
      reason: 'PHASE_WINDOW_INSIDE_MIN_INTERVAL',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    },
    b4: {
      policyVersion: 'P25_APD_B4_V1',
      decision: 'WOULD_SKIP',
      reason: 'STABLE_PHASE_OUTSIDE_5M',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    },
  });

const dec = (
  decision: ApdsV3OfflinePolicyDecision['decision'],
  reason: string,
): ApdsV3OfflinePolicyDecision => ({
  policyVersion: 'APDS_V3_OFFLINE_P1B0',
  decision,
  reason,
  expectedInformationGain: 0.2,
  heuristic: true,
  hardSafetyTriggered: false,
});

describe('apds-v3-replay-accounting.v1', () => {
  it('NOT_ASSESSABLE preserves baseline poll projection', () => {
    const a = skipBoth(dec('NOT_ASSESSABLE', 'KS_MX'));
    expect(a.countsTowardProjectedPhysicalPoll).toBe(true);
    expect(a.countsTowardHypotheticalSkipSavings).toBe(false);
    expect(a.outcomeClass).toBe('V3_PRESERVE_BASELINE_NOT_ASSESSABLE');
  });

  it('INSUFFICIENT_EVIDENCE preserves baseline poll', () => {
    const a = skipBoth(dec('INSUFFICIENT_EVIDENCE', 'CONSUMER_FAIL_CLOSED'));
    expect(a.countsTowardProjectedPhysicalPoll).toBe(true);
    expect(a.outcomeClass).toBe('V3_PRESERVE_BASELINE_INSUFFICIENT_EVIDENCE');
  });

  it('baseline not due is separate from physical opportunity', () => {
    const a = classifyV3ReplayPhysicalAccounting({
      baselineDue: false,
      v3: dec('WOULD_SKIP', 'LOW_HEURISTIC_INFORMATION_GAIN'),
      b2: { policyVersion: 'P25_APD_B2_V1', decision: 'WOULD_SKIP', reason: 'PHASE_WINDOW_INSIDE_MIN_INTERVAL', expectedWindowStartMs: null, expectedWindowEndMs: null },
      b4: { policyVersion: 'P25_APD_B4_V1', decision: 'WOULD_SKIP', reason: 'STABLE_PHASE_OUTSIDE_5M', expectedWindowStartMs: null, expectedWindowEndMs: null },
    });
    expect(a.outcomeClass).toBe('BASELINE_NOT_DUE_DECISION_TICK');
    expect(a.countsTowardHypotheticalSkipSavings).toBe(false);
  });
});
