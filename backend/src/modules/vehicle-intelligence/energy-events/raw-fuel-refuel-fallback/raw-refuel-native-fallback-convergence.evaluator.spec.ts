import type { RawRefuelCandidate } from '@prisma/client';
import { classifyPhysicalRefuelSibling } from '../physical-refuel-identity.matcher';
import type { RefuelRowForMatcher } from '../physical-refuel-identity.matcher';
import {
  AUTHORITATIVE_NATIVE_SIBLING_SENTINEL_TAKE,
  buildNativeSiblingLimitExceededEvaluation,
  detectAuthoritativeNativeSiblingLimitExceeded,
  evaluateRawRefuelNativeFallbackConvergence,
  MAX_AUTHORITATIVE_NATIVE_SIBLINGS,
  NATIVE_SIBLING_LIMIT_EXCEEDED_DETAIL,
} from './raw-refuel-native-fallback-convergence.evaluator';

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

function evaluate(nativeRefuelRows: RefuelRowForMatcher[], cand = candidate()) {
  return evaluateRawRefuelNativeFallbackConvergence({ candidate: cand, nativeRefuelRows });
}

describe('evaluateRawRefuelNativeFallbackConvergence (F5 authoritative)', () => {
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

  it('no native siblings => NO_NATIVE_SIBLINGS without convergence', () => {
    const result = evaluate([]);
    expect(result.classification).toBe('NO_NATIVE_SIBLINGS');
    expect(result.shouldConvergeToNative).toBe(false);
    expect(result.failClosed).toBe(false);
  });

  it('single SAME => SAME_NATIVE with convergence intent', () => {
    const result = evaluate([nativeSame]);
    expect(result.classification).toBe('SAME_NATIVE');
    expect(result.shouldConvergeToNative).toBe(true);
    expect(result.authoritativeSameNativeEventId).toBe('native-same');
    expect(result.failClosed).toBe(false);
  });

  it('insufficient only => INSUFFICIENT_EVIDENCE fail closed', () => {
    const result = evaluate([nativeInsufficient]);
    expect(result.classification).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.shouldConvergeToNative).toBe(false);
    expect(result.failClosed).toBe(true);
  });

  it('SAME + INSUFFICIENT => fail closed (must not collapse to SAME)', () => {
    const result = evaluate([nativeSame, nativeInsufficient]);
    expect(result.classification).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.shouldConvergeToNative).toBe(false);
    expect(result.failClosed).toBe(true);
    expect(result.detail).toBe('same_with_insufficient_native_siblings');
  });

  it('SAME + DISTINCT => AMBIGUOUS fail closed (stricter than F4 advisory)', () => {
    const result = evaluate([nativeSame, nativeDistinct]);
    expect(result.classification).toBe('AMBIGUOUS');
    expect(result.shouldConvergeToNative).toBe(false);
    expect(result.failClosed).toBe(true);
    expect(result.detail).toBe('same_with_distinct_native_siblings');
  });

  it('multiple SAME => AMBIGUOUS fail closed', () => {
    const result = evaluate([
      nativeSame,
      { ...nativeSame, id: 'native-same-2', dimoSegmentId: 'd2' },
    ]);
    expect(result.classification).toBe('AMBIGUOUS');
    expect(result.failClosed).toBe(true);
    expect(result.detail).toBe('multiple_same_native_siblings');
  });

  it('F10.6.6-B — pre-fix raw triple-SAME remains ambiguous before reconciliation filter', () => {
    const result = evaluate([
      nativeSame,
      { ...nativeSame, id: 'native-same-2', dimoSegmentId: 'd2' },
      { ...nativeSame, id: 'native-same-3', dimoSegmentId: 'd3' },
    ]);
    expect(result.classification).toBe('AMBIGUOUS');
    expect(result.failClosed).toBe(true);
    expect(result.sameNativeEventIds).toHaveLength(3);
  });

  it('all DISTINCT => DISTINCT_FROM_NATIVE without convergence', () => {
    const result = evaluate([nativeDistinct]);
    expect(result.classification).toBe('DISTINCT_FROM_NATIVE');
    expect(result.shouldConvergeToNative).toBe(false);
    expect(result.failClosed).toBe(false);
  });

  it('foreign vehicle rows are ignored', () => {
    const result = evaluate([foreignVehicleRow]);
    expect(result.classification).toBe('NO_NATIVE_SIBLINGS');
  });
});

describe('authoritative native sibling bounded overflow (F5-PR1.1)', () => {
  it('sentinel take is MAX+1', () => {
    expect(AUTHORITATIVE_NATIVE_SIBLING_SENTINEL_TAKE).toBe(
      MAX_AUTHORITATIVE_NATIVE_SIBLINGS + 1,
    );
  });

  it('0..MAX rows do not trigger overflow detection', () => {
    expect(detectAuthoritativeNativeSiblingLimitExceeded(0)).toBe(false);
    expect(detectAuthoritativeNativeSiblingLimitExceeded(32)).toBe(false);
  });

  it('>MAX rows trigger overflow detection', () => {
    expect(detectAuthoritativeNativeSiblingLimitExceeded(33)).toBe(true);
  });

  it('overflow evaluation fails closed with explicit detail', () => {
    const evaluation = buildNativeSiblingLimitExceededEvaluation();
    expect(evaluation.failClosed).toBe(true);
    expect(evaluation.shouldConvergeToNative).toBe(false);
    expect(evaluation.detail).toBe(NATIVE_SIBLING_LIMIT_EXCEEDED_DETAIL);
    expect(evaluation.classification).toBe('AMBIGUOUS');
  });
});
