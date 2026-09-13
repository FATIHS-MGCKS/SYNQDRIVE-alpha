import type { RawRefuelCandidate } from '@prisma/client';
import { evaluateRawRefuelCandidateReadiness } from './raw-refuel-candidate-readiness.evaluator';
import { buildKsMs661ObservedObservation } from '../raw-refuel-candidate/testing/ks-ms-661-candidate-observation.util';

function baseCandidate(
  overrides: Partial<RawRefuelCandidate> = {},
): RawRefuelCandidate {
  const obs = buildKsMs661ObservedObservation({ lifecycleState: 'READY_FOR_PERSIST' });
  return {
    id: 'cand-1',
    organizationId: obs.organizationId,
    vehicleId: obs.vehicleId,
    candidateIdentityKey: 'identity-key-661',
    detectionVersion: obs.detectionVersion,
    detectorVersion: obs.detectorVersion,
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    evidenceRevisionFingerprint: 'fp-1',
    physicalEvidenceStart: obs.physicalEvidenceStart!,
    physicalEvidenceEnd: obs.physicalEvidenceEnd!,
    riseOnsetAt: obs.riseOnsetAt!,
    riseEndAt: obs.riseEndAt!,
    preFuelAbsoluteLiters: obs.preFuelAbsoluteLiters!,
    postFuelAbsoluteLiters: obs.postFuelAbsoluteLiters!,
    deltaAbsoluteLiters: obs.deltaAbsoluteLiters!,
    preFuelRelativePercent: null,
    postFuelRelativePercent: null,
    deltaRelativePercent: null,
    prePlateauSampleCount: 13,
    postPlateauSampleCount: 4,
    totalSampleCount: 17,
    maxSampleGapSeconds: 270,
    absoluteSignalTrust: 'UNKNOWN',
    relativeSignalAvailable: false,
    routeEvidenceAvailable: false,
    stationaryEvidenceAvailable: false,
    scanWindowStart: obs.scanWindowStart!,
    scanWindowEnd: obs.scanWindowEnd!,
    signalProvider: 'DIMO',
    evidenceMeta: {},
    qualityMeta: { absoluteDetectionAdmissibility: 'ADMISSIBLE' },
    firstObservedAt: new Date('2026-09-06T10:00:00.000Z'),
    lastObservedAt: new Date('2026-09-06T10:00:00.000Z'),
    createdAt: new Date('2026-09-06T10:00:00.000Z'),
    updatedAt: new Date('2026-09-06T10:00:00.000Z'),
    ...overrides,
  } as RawRefuelCandidate;
}

describe('evaluateRawRefuelCandidateReadiness', () => {
  it('READY_FOR_PERSIST with complete evidence => ready', () => {
    const result = evaluateRawRefuelCandidateReadiness(baseCandidate(), {
      capability: 'FUEL_CAPABLE',
    });
    expect(result.ready).toBe(true);
    expect(result.reasonCode).toBe('READY');
  });

  it('REJECTED lifecycle => TERMINAL_REJECTED', () => {
    const result = evaluateRawRefuelCandidateReadiness(
      baseCandidate({ lifecycleState: 'REJECTED' }),
    );
    expect(result.ready).toBe(false);
    expect(result.reasonCode).toBe('TERMINAL_REJECTED');
  });

  it('SETTLING lifecycle => CANDIDATE_SETTLING or POST_PLATEAU_NOT_FINAL', () => {
    const result = evaluateRawRefuelCandidateReadiness(
      baseCandidate({
        lifecycleState: 'SETTLING',
        rejectionReason: 'EVIDENCE_STILL_SETTLING',
      }),
    );
    expect(result.ready).toBe(false);
    expect(['CANDIDATE_SETTLING', 'POST_PLATEAU_NOT_FINAL']).toContain(result.reasonCode);
  });

  it('INADMISSIBLE detection => DETECTION_NOT_ADMISSIBLE', () => {
    const result = evaluateRawRefuelCandidateReadiness(baseCandidate(), {
      absoluteDetectionAdmissibility: 'INADMISSIBLE',
    });
    expect(result.reasonCode).toBe('DETECTION_NOT_ADMISSIBLE');
  });

  it('identical replay is deterministic', () => {
    const candidate = baseCandidate();
    const a = evaluateRawRefuelCandidateReadiness(candidate);
    const b = evaluateRawRefuelCandidateReadiness(candidate);
    expect(a).toEqual(b);
  });
});
