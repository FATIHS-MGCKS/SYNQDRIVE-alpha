import { classifyRawRefuelCandidateOverlap } from '../raw-refuel-candidate/raw-refuel-candidate.matcher';
import { RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION } from '../raw-refuel-candidate/raw-refuel-candidate-cross-version-compatibility.authority';
import { buildTestObservation } from '../raw-refuel-candidate/testing/raw-refuel-candidate-test.util';
import type { RawRefuelCandidate } from '@prisma/client';

/** R3B regression: v2→v2 settled median revision within tolerance stays SAME_PHYSICAL_RISE. */
describe('R3B — v2→v2 rediscovery matcher regression', () => {
  it('documents SAME_VERSION when post liters change within tolerance', () => {
    const base = buildTestObservation({
      organizationId: 'org-r3a',
      vehicleId: 'veh-r3a',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      postFuelAbsoluteLiters: 19,
      evidenceMeta: {
        postFuelAuthority: 'SETTLED_MEDIAN',
        baselineRecencyClassification: 'FRESH',
      },
    });
    const stored: RawRefuelCandidate = {
      ...(base as unknown as RawRefuelCandidate),
      id: 'stored-v2',
      candidateIdentityKey: 'physical-key',
      detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
      postFuelAbsoluteLiters: 19,
      lifecycleState: 'READY_FOR_PERSIST',
      evidenceRevisionFingerprint: 'fp',
      firstObservedAt: new Date(),
      lastObservedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      recoveryNextAttemptAt: new Date(),
      recoveryAttemptCount: 0,
    } as RawRefuelCandidate;
    const incoming = buildTestObservation({
      ...base,
      postFuelAbsoluteLiters: 18,
      evidenceMeta: {
        postFuelAuthority: 'SETTLED_MEDIAN',
        baselineRecencyClassification: 'FRESH',
      },
    });
    const overlap = classifyRawRefuelCandidateOverlap(incoming, stored);
    expect(overlap).toBe('SAME_PHYSICAL_RISE');
  });
});
