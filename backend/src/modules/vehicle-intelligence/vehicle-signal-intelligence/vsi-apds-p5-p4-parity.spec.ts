import { buildVsiConsumerDemandVectorV1 } from './vsi-apds-demand-vector.builder';
import { evaluateVsiConsumerRequirement } from './vsi-capability-resolver.engine';
import { VSI_CAPABILITY_RESOLVER_TEST_REQUIREMENTS } from './vsi-capability-resolver.test-registry';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';

const evalAt = new Date('2026-10-16T06:00:00.000Z');

const approvedReq = VSI_CAPABILITY_RESOLVER_TEST_REQUIREMENTS.find(
  (r) => r.requirementId === 'apds.fixture.runtime_approved',
)!;

function profile(ts: string): VsiCapabilityResolverProfileContext {
  return {
    profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
    profileRevision: 1,
    contentFingerprint: 'fp',
    profileLimitations: [],
    signals: [
      {
        canonicalSignalKey: 'provider_source_timestamp',
        declaredSupport: 'LISTED',
        empiricalObservation: 'OBSERVED',
        lastSourceTimestamp: ts,
        lastValidObservationAt: ts,
        freshnessClassification: 'FRESH',
        limitations: [],
        qualityClassification: 'OBSERVED_FRESH',
        confidenceLevel: 'HIGH',
        observedCadenceMedianSeconds: null,
        observedSamples: null,
      },
    ],
  };
}

describe('vsi-apds P4/P5 assessability parity', () => {
  it('P5 SATISFIED matches P4 evaluateVsiConsumerRequirement when retrospective assessable', () => {
    const p = profile(evalAt.toISOString());
    const p4 = evaluateVsiConsumerRequirement(approvedReq, p, evalAt.getTime());
    const demand = buildVsiConsumerDemandVectorV1({
      profile: p,
      evaluationTimeMs: evalAt.getTime(),
      attributionUnknown: false,
      failClosed: false,
      decisionTimeRetrospectiveAssessable: true,
      requirements: [approvedReq],
    });
    const row = demand[0];
    expect(p4.satisfied).toBe(true);
    expect(row.assessmentStatus).toBe('SATISFIED');
  });

  it('P5 NOT_ASSESSABLE when P4 would reject stale signal at evaluation', () => {
    const p = profile('2020-01-01T00:00:00.000Z');
    const p4 = evaluateVsiConsumerRequirement(approvedReq, p, evalAt.getTime());
    const demand = buildVsiConsumerDemandVectorV1({
      profile: p,
      evaluationTimeMs: evalAt.getTime(),
      attributionUnknown: false,
      failClosed: false,
      decisionTimeRetrospectiveAssessable: true,
      requirements: [approvedReq],
    });
    expect(p4.satisfied).toBe(false);
    expect(demand[0].assessmentStatus).toBe('INSUFFICIENT');
  });

  it('retrospective gate blocks SATISFIED even when P4 satisfied on current snapshot', () => {
    const p = profile(evalAt.toISOString());
    const demand = buildVsiConsumerDemandVectorV1({
      profile: p,
      evaluationTimeMs: evalAt.getTime(),
      attributionUnknown: false,
      failClosed: false,
      decisionTimeRetrospectiveAssessable: false,
      requirements: [approvedReq],
    });
    expect(demand[0].assessmentStatus).toBe('NOT_ASSESSABLE');
  });
});
