import type { RawRefuelCandidate } from '@prisma/client';
import { classifyPhysicalRefuelSibling } from '../physical-refuel-identity.matcher';
import type { RefuelRowForMatcher } from '../physical-refuel-identity.matcher';
import { mapRawRefuelCandidateToPromotionDraft } from '../raw-refuel-candidate/raw-refuel-candidate-promotion.design';
import { evaluateRawRefuelCandidateReadiness } from './raw-refuel-candidate-readiness.evaluator';
import { classifyRawRefuelNativeOverlapAdvisory } from './raw-refuel-native-overlap.advisory';
import { evaluateRawRefuelPromotionEligibility } from './raw-refuel-promotion-eligibility.evaluator';

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

function classify(input: {
  candidate?: RawRefuelCandidate;
  nativeRefuelRows: RefuelRowForMatcher[];
}) {
  return classifyRawRefuelNativeOverlapAdvisory({
    candidate: input.candidate ?? candidate(),
    nativeRefuelRows: input.nativeRefuelRows,
  });
}

describe('classifyRawRefuelNativeOverlapAdvisory', () => {
  const nativeSame: RefuelRowForMatcher = {
    id: 'native-same',
    vehicleId: 'veh-1',
    kind: 'REFUEL',
    startTime: '2026-09-06T09:35:00.000Z',
    endTime: '2026-09-06T09:47:00.000Z',
    fuelStartLiters: 7,
    fuelEndLiters: 31,
    fuelDeltaLiters: 24,
    dimoSegmentId: 'dimo-native-same',
  };

  const nativeInsufficient: RefuelRowForMatcher = {
    id: 'native-insufficient',
    vehicleId: 'veh-1',
    kind: 'REFUEL',
    startTime: '2026-09-06T09:40:00.000Z',
    endTime: '2026-09-06T09:47:00.000Z',
    dimoSegmentId: 'dimo-native-insufficient',
  };

  const nativeDistinct: RefuelRowForMatcher = {
    id: 'native-distinct',
    vehicleId: 'veh-1',
    kind: 'REFUEL',
    startTime: '2026-09-06T10:00:00.000Z',
    endTime: '2026-09-06T10:30:00.000Z',
    fuelStartLiters: 20,
    fuelEndLiters: 40,
    fuelDeltaLiters: 20,
    dimoSegmentId: 'dimo-native-distinct',
  };

  const foreignVehicleRow: RefuelRowForMatcher = {
    ...nativeSame,
    id: 'foreign-native',
    vehicleId: 'veh-other',
    dimoSegmentId: 'dimo-foreign',
  };

  beforeAll(() => {
    const cand = candidate();
    const candidateRow = {
      id: cand.id,
      vehicleId: cand.vehicleId,
      kind: 'REFUEL' as const,
      startTime: cand.physicalEvidenceStart!.toISOString(),
      endTime: cand.physicalEvidenceEnd!.toISOString(),
      fuelStartLiters: cand.preFuelAbsoluteLiters,
      fuelEndLiters: cand.postFuelAbsoluteLiters,
      fuelDeltaLiters: cand.deltaAbsoluteLiters,
      dimoSegmentId: 'fallback-placeholder',
    };
    expect(classifyPhysicalRefuelSibling(candidateRow, nativeSame).classification).toBe(
      'SAME_PHYSICAL_REFUEL',
    );
    expect(classifyPhysicalRefuelSibling(candidateRow, nativeInsufficient).classification).toBe(
      'INSUFFICIENT_EVIDENCE',
    );
    expect(classifyPhysicalRefuelSibling(candidateRow, nativeDistinct).classification).toBe(
      'DISTINCT_PHYSICAL_REFUEL',
    );
  });

  it('A — no native siblings => NO_NATIVE_SIBLINGS', () => {
    expect(classify({ nativeRefuelRows: [] }).advisoryClassification).toBe('NO_NATIVE_SIBLINGS');
  });

  it('B — distinct only => DISTINCT', () => {
    const result = classify({ nativeRefuelRows: [nativeDistinct] });
    expect(result.advisoryClassification).toBe('DISTINCT');
    expect(result.distinctNativeEventIds).toEqual(['native-distinct']);
  });

  it('C — one SAME only => SAME', () => {
    const result = classify({ nativeRefuelRows: [nativeSame] });
    expect(result.advisoryClassification).toBe('SAME');
    expect(result.sameNativeEventIds).toEqual(['native-same']);
  });

  it('D — multiple SAME => AMBIGUOUS_MULTIPLE_SAME', () => {
    const result = classify({
      nativeRefuelRows: [nativeSame, { ...nativeSame, id: 'native-same-2', dimoSegmentId: 'd2' }],
    });
    expect(result.advisoryClassification).toBe('AMBIGUOUS_MULTIPLE_SAME');
  });

  it('E — insufficient only => INSUFFICIENT_EVIDENCE', () => {
    const result = classify({ nativeRefuelRows: [nativeInsufficient] });
    expect(result.advisoryClassification).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('F — SAME + INSUFFICIENT fail closed => INSUFFICIENT_EVIDENCE (not SAME)', () => {
    const result = classify({ nativeRefuelRows: [nativeSame, nativeInsufficient] });
    expect(result.advisoryClassification).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.advisoryClassification).not.toBe('SAME');
    expect(result.detail).toBe('same_with_insufficient_native_siblings');
  });

  it('G — SAME + DISTINCT => clean SAME when no INSUFFICIENT sibling', () => {
    const result = classify({ nativeRefuelRows: [nativeSame, nativeDistinct] });
    expect(result.advisoryClassification).toBe('SAME');
  });

  it('H — SAME + DISTINCT + INSUFFICIENT fail closed => INSUFFICIENT_EVIDENCE', () => {
    const result = classify({
      nativeRefuelRows: [nativeSame, nativeDistinct, nativeInsufficient],
    });
    expect(result.advisoryClassification).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.advisoryClassification).not.toBe('SAME');
  });

  it('I — multiple SAME + INSUFFICIENT => AMBIGUOUS_MULTIPLE_SAME', () => {
    const result = classify({
      nativeRefuelRows: [
        nativeSame,
        { ...nativeSame, id: 'native-same-2', dimoSegmentId: 'd2' },
        nativeInsufficient,
      ],
    });
    expect(result.advisoryClassification).toBe('AMBIGUOUS_MULTIPLE_SAME');
  });

  it('10 — foreign-vehicle rows only => NO_NATIVE_SIBLINGS (not DISTINCT)', () => {
    const result = classify({ nativeRefuelRows: [foreignVehicleRow] });
    expect(result.advisoryClassification).toBe('NO_NATIVE_SIBLINGS');
  });

  it('SAME + INSUFFICIENT keeps promotion eligibility fail-closed via AMBIGUOUS', () => {
    const overlap = classify({ nativeRefuelRows: [nativeSame, nativeInsufficient] });
    const readiness = evaluateRawRefuelCandidateReadiness(candidate(), {
      capability: 'FUEL_CAPABLE',
    });
    readiness.ready = true;
    readiness.reasonCode = 'READY';

    const eligibility = evaluateRawRefuelPromotionEligibility(readiness, {
      capability: 'FUEL_CAPABLE',
      absoluteDetectionAdmissibility: 'ADMISSIBLE',
      absoluteSignalTrust: 'TRUSTED',
      nativeOverlap: overlap,
    });

    expect(eligibility.status).toBe('AMBIGUOUS');
    expect(eligibility.blockedPendingF5).toBe(true);
  });

  it('sourceEventKey stable when evidence fingerprint changes', () => {
    const draftA = mapRawRefuelCandidateToPromotionDraft(
      candidate({ evidenceRevisionFingerprint: 'fp-a' }),
    );
    const draftB = mapRawRefuelCandidateToPromotionDraft(
      candidate({ evidenceRevisionFingerprint: 'fp-b' }),
    );
    expect(draftA.sourceEventKey).toBe(draftB.sourceEventKey);
    expect(draftA.sourceEventKey).toBe('stable-identity-key');
  });
});
