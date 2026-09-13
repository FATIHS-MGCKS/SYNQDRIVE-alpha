import type { RawRefuelCandidate } from '@prisma/client';
import { classifyRawRefuelNativeOverlapAdvisory } from './raw-refuel-native-overlap.advisory';
import type { RefuelRowForMatcher } from '../physical-refuel-identity.matcher';
import { mapRawRefuelCandidateToPromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';

function candidate(overrides: Partial<RawRefuelCandidate> = {}): RawRefuelCandidate {
  return {
    id: 'fallback-cand',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    candidateIdentityKey: 'stable-identity-key',
    detectionVersion: 'rfrf-v1',
    detectorVersion: 'rfrf-detector-v1',
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    evidenceRevisionFingerprint: 'fp-a',
    physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
    physicalEvidenceEnd: new Date('2026-09-06T09:47:00.000Z'),
    riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
    riseEndAt: new Date('2026-09-06T09:47:00.000Z'),
    preFuelAbsoluteLiters: 7,
    postFuelAbsoluteLiters: 31,
    deltaAbsoluteLiters: 24,
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
    scanWindowStart: new Date('2026-09-06T08:30:00.000Z'),
    scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
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

describe('classifyRawRefuelNativeOverlapAdvisory', () => {
  const nativeSame: RefuelRowForMatcher = {
    id: 'native-1',
    vehicleId: 'veh-1',
    kind: 'REFUEL',
    startTime: '2026-09-06T09:35:00.000Z',
    endTime: '2026-09-06T09:47:00.000Z',
    fuelStartLiters: 7,
    fuelEndLiters: 31,
    fuelDeltaLiters: 24,
    dimoSegmentId: 'dimo-native-1',
  };

  it('no native siblings => NO_NATIVE_SIBLINGS', () => {
    const result = classifyRawRefuelNativeOverlapAdvisory({
      candidate: candidate(),
      nativeRefuelRows: [],
    });
    expect(result.advisoryClassification).toBe('NO_NATIVE_SIBLINGS');
  });

  it('single SAME sibling => SAME advisory only', () => {
    const result = classifyRawRefuelNativeOverlapAdvisory({
      candidate: candidate(),
      nativeRefuelRows: [nativeSame],
    });
    expect(result.advisoryClassification).toBe('SAME');
    expect(result.sameNativeEventIds).toEqual(['native-1']);
  });

  it('multiple SAME siblings => AMBIGUOUS_MULTIPLE_SAME fail closed', () => {
    const result = classifyRawRefuelNativeOverlapAdvisory({
      candidate: candidate(),
      nativeRefuelRows: [nativeSame, { ...nativeSame, id: 'native-2', dimoSegmentId: 'd2' }],
    });
    expect(result.advisoryClassification).toBe('AMBIGUOUS_MULTIPLE_SAME');
  });

  it('sourceEventKey stable when evidence fingerprint changes', () => {
    const draftA = mapRawRefuelCandidateToPromotionDraft(candidate({ evidenceRevisionFingerprint: 'fp-a' }));
    const draftB = mapRawRefuelCandidateToPromotionDraft(candidate({ evidenceRevisionFingerprint: 'fp-b' }));
    expect(draftA.sourceEventKey).toBe(draftB.sourceEventKey);
    expect(draftA.sourceEventKey).toBe('stable-identity-key');
  });
});
