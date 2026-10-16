import {
  classifyVsiApdsProfileEvidenceInterpretation,
  VsiApdsProfileEvidenceInterpretation,
} from './vsi-apds-profile-evidence-time';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';

const decisionAt = new Date('2026-10-16T06:00:00.000Z');

function prof(signals: { key: string; ts: string }[]): VsiCapabilityResolverProfileContext {
  return {
    profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
    profileRevision: 2,
    contentFingerprint: 'fp',
    profileLimitations: [],
    signals: signals.map((s) => ({
      canonicalSignalKey: s.key,
      declaredSupport: 'LISTED',
      empiricalObservation: 'OBSERVED',
      lastSourceTimestamp: s.ts,
      lastValidObservationAt: s.ts,
      freshnessClassification: 'FRESH',
      limitations: [],
      qualityClassification: 'OBSERVED_FRESH',
      confidenceLevel: 'HIGH',
      observedCadenceMedianSeconds: null,
      observedSamples: null,
    })),
  };
}

describe('vsi-apds profile evidence-time', () => {
  it('VERIFIED when profile temporal authority precedes decision and signals', () => {
    const r = classifyVsiApdsProfileEvidenceInterpretation({
      profile: prof([{ key: 'lv_voltage', ts: '2026-10-16T05:00:00.000Z' }]),
      temporal: {
        evaluatedAt: new Date('2026-10-16T05:30:00.000Z'),
        createdAt: new Date('2026-10-16T04:00:00.000Z'),
        updatedAt: new Date('2026-10-16T05:30:00.000Z'),
        profileRevision: 2,
      },
      shadowDecisionAt: decisionAt,
    });
    expect(r.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT,
    );
    expect(r.decisionTimeRetrospectiveAssessable).toBe(true);
  });

  it('CURRENT_PROFILE_REVIEW when profile created after decision', () => {
    const r = classifyVsiApdsProfileEvidenceInterpretation({
      profile: prof([{ key: 'lv_voltage', ts: '2026-10-16T13:00:00.000Z' }]),
      temporal: {
        evaluatedAt: new Date('2026-10-16T13:00:00.000Z'),
        createdAt: new Date('2026-10-16T13:00:00.000Z'),
        updatedAt: new Date('2026-10-16T13:00:00.000Z'),
        profileRevision: 1,
      },
      shadowDecisionAt: decisionAt,
    });
    expect(r.interpretation).toBe(VsiApdsProfileEvidenceInterpretation.CURRENT_PROFILE_REVIEW);
    expect(r.decisionTimeRetrospectiveAssessable).toBe(false);
    expect(r.limitations).toContain('PROFILE_CREATED_AFTER_SHADOW_DECISION');
  });

  it('CURRENT_PROFILE_REVIEW when signal first observed after decision', () => {
    const r = classifyVsiApdsProfileEvidenceInterpretation({
      profile: prof([{ key: 'vehicle_speed', ts: '2026-10-16T13:00:00.000Z' }]),
      temporal: {
        evaluatedAt: new Date('2026-10-16T11:00:00.000Z'),
        createdAt: new Date('2026-10-16T10:00:00.000Z'),
        updatedAt: new Date('2026-10-16T11:00:00.000Z'),
        profileRevision: 3,
      },
      shadowDecisionAt: decisionAt,
    });
    expect(r.limitations.some((l) => l.startsWith('SIGNAL_EVIDENCE_AFTER_DECISION'))).toBe(true);
    expect(r.decisionTimeRetrospectiveAssessable).toBe(false);
  });

  it('HISTORICAL_PROFILE_UNAVAILABLE when profile missing', () => {
    const r = classifyVsiApdsProfileEvidenceInterpretation({
      profile: null,
      temporal: null,
      shadowDecisionAt: decisionAt,
    });
    expect(r.interpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.HISTORICAL_PROFILE_UNAVAILABLE,
    );
  });
});
