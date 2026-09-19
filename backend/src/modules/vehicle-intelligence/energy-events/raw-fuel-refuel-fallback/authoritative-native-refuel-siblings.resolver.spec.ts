import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type RawRefuelCandidate,
  type VehicleEnergyEvent,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import { evaluateRawRefuelNativeFallbackConvergence } from './raw-refuel-native-fallback-convergence.evaluator';
import { resolveAuthoritativeNativeRefuelSiblingsFromLoaded } from './authoritative-native-refuel-siblings.resolver';
import {
  NATIVE_PHYSICAL_RECONCILIATION_NOT_FINAL_DETAIL,
  PHYSICAL_REFUEL_AUTHORITY_CONFLICT_DETAIL,
} from './raw-refuel-native-fallback-convergence.evaluator';

function candidate(overrides: Partial<RawRefuelCandidate> = {}): RawRefuelCandidate {
  return {
    id: 'rfrf-cand-wob-shape',
    organizationId: 'org-test',
    vehicleId: 'veh-test',
    candidateIdentityKey: 'identity-wob-shape',
    detectionVersion: 'rfrf-rise-v1',
    detectorVersion: 'rfrf-rise-detector-v1',
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    evidenceRevisionFingerprint: 'fp-wob',
    physicalEvidenceStart: new Date('2026-09-19T15:40:26.000Z'),
    physicalEvidenceEnd: new Date('2026-09-19T16:58:31.000Z'),
    riseOnsetAt: new Date('2026-09-19T16:11:24.000Z'),
    riseEndAt: new Date('2026-09-19T16:15:27.000Z'),
    preFuelAbsoluteLiters: 5,
    postFuelAbsoluteLiters: 18,
    deltaAbsoluteLiters: 13,
    preFuelRelativePercent: null,
    postFuelRelativePercent: null,
    deltaRelativePercent: null,
    prePlateauSampleCount: 5,
    postPlateauSampleCount: 3,
    totalSampleCount: 12,
    maxSampleGapSeconds: 990,
    absoluteSignalTrust: 'UNKNOWN',
    relativeSignalAvailable: false,
    routeEvidenceAvailable: false,
    stationaryEvidenceAvailable: false,
    scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
    signalProvider: 'DIMO',
    evidenceMeta: {},
    qualityMeta: { absoluteDetectionAdmissibility: 'ADMISSIBLE' },
    firstObservedAt: new Date('2026-09-19T17:00:00.000Z'),
    lastObservedAt: new Date('2026-09-19T17:00:00.000Z'),
    createdAt: new Date('2026-09-19T17:00:00.000Z'),
    updatedAt: new Date('2026-09-19T17:00:00.000Z'),
    ...overrides,
  } as RawRefuelCandidate;
}

function nativeRevision(input: {
  id: string;
  dimoSegmentId: string;
  startIso: string;
  endIso: string;
  fuelStart: number;
  fuelEnd: number;
  fuelDelta: number;
}): VehicleEnergyEvent {
  return {
    id: input.id,
    organizationId: 'org-test',
    vehicleId: 'veh-test',
    kind: EnergyEventKind.REFUEL,
    detectionSource: 'DIMO_NATIVE',
    dimoSegmentId: input.dimoSegmentId,
    startTime: new Date(input.startIso),
    endTime: new Date(input.endIso),
    fuelDeltaLiters: input.fuelDelta,
    rawDetectionMeta: {
      fuelStartLiters: input.fuelStart,
      fuelEndLiters: input.fuelEnd,
    },
    createdAt: new Date(input.startIso),
    updatedAt: new Date(input.startIso),
  } as unknown as VehicleEnergyEvent;
}

function reconFor(
  event: VehicleEnergyEvent,
  input: {
    groupId: string;
    finalityState: PhysicalRefuelFinalityState;
    enrichmentEligible: boolean;
    canonicalEventId: string | null;
    classification?: string;
  },
): VehicleEnergyEventRefuelReconciliation {
  return {
    id: `recon-${event.id}`,
    energyEventId: event.id,
    vehicleId: event.vehicleId,
    reconciliationGroupId: input.groupId,
    classification: input.classification ?? 'SAME_PHYSICAL_REFUEL',
    finalityState: input.finalityState,
    canonicalEventId: input.canonicalEventId,
    enrichmentEligible: input.enrichmentEligible,
    settlementWindowOpen: false,
    lateSiblingConflict: false,
    reason: 'test',
    reasonCodes: [],
    reconciledAt: new Date('2026-09-19T17:00:00.000Z'),
    updatedAt: new Date('2026-09-19T17:00:00.000Z'),
  } as unknown as VehicleEnergyEventRefuelReconciliation;
}

function buildThreeRevisionWobShapeEvents(): Array<
  VehicleEnergyEvent & { refuelReconciliation: VehicleEnergyEventRefuelReconciliation }
> {
  const groupId = 'veh-test:physical-wob-shape';
  const rev1 = nativeRevision({
    id: 'native-rev-1',
    dimoSegmentId: 'dimo-seg-rev-1',
    startIso: '2026-09-19T16:08:00.000Z',
    endIso: '2026-09-19T16:12:00.000Z',
    fuelStart: 5,
    fuelEnd: 16,
    fuelDelta: 11,
  });
  const rev2 = nativeRevision({
    id: 'native-rev-2',
    dimoSegmentId: 'dimo-seg-rev-2',
    startIso: '2026-09-19T16:09:00.000Z',
    endIso: '2026-09-19T16:14:00.000Z',
    fuelStart: 5,
    fuelEnd: 17,
    fuelDelta: 12,
  });
  const rev3 = nativeRevision({
    id: 'native-rev-3',
    dimoSegmentId: 'dimo-seg-rev-3',
    startIso: '2026-09-19T16:09:00.000Z',
    endIso: '2026-09-19T16:15:27.000Z',
    fuelStart: 5,
    fuelEnd: 18,
    fuelDelta: 13,
  });
  const canonicalId = rev3.id;
  return [
    {
      ...rev1,
      refuelReconciliation: reconFor(rev1, {
        groupId,
        finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
        enrichmentEligible: false,
        canonicalEventId: canonicalId,
      }),
    },
    {
      ...rev2,
      refuelReconciliation: reconFor(rev2, {
        groupId,
        finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
        enrichmentEligible: false,
        canonicalEventId: canonicalId,
      }),
    },
    {
      ...rev3,
      refuelReconciliation: reconFor(rev3, {
        groupId,
        finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
        enrichmentEligible: true,
        canonicalEventId: canonicalId,
      }),
    },
  ];
}

describe('authoritative-native-refuel-siblings.resolver (F10.6.6-B)', () => {
  const cand = candidate();

  it('PRE-FIX — raw three-revision siblings fail closed as multiple SAME', () => {
    const sameRow = {
      id: 'native-rev-1',
      vehicleId: 'veh-test',
      kind: 'REFUEL' as const,
      startTime: '2026-09-19T16:09:00.000Z',
      endTime: '2026-09-19T16:15:27.000Z',
      fuelStartLiters: 5,
      fuelEndLiters: 18,
      fuelDeltaLiters: 13,
      dimoSegmentId: 'dimo-seg-rev-1',
    };
    const preFixEvaluation = evaluateRawRefuelNativeFallbackConvergence({
      candidate: cand,
      nativeRefuelRows: [
        sameRow,
        { ...sameRow, id: 'native-rev-2', dimoSegmentId: 'dimo-seg-rev-2' },
        { ...sameRow, id: 'native-rev-3', dimoSegmentId: 'dimo-seg-rev-3' },
      ],
    });
    expect(preFixEvaluation.classification).toBe('AMBIGUOUS');
    expect(preFixEvaluation.failClosed).toBe(true);
    expect(preFixEvaluation.detail).toBe('multiple_same_native_siblings');
  });

  it('WOB-shaped three revisions → one authoritative native sibling', () => {
    const loaded = buildThreeRevisionWobShapeEvents();
    const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
      candidate: cand,
      loadedNativeEvents: loaded,
    });
    expect(resolved.rawNativeRowCount).toBe(3);
    expect(resolved.physicalRefuelComponentCount).toBe(1);
    expect(resolved.status).toBe('OK');
    expect(resolved.authoritativeNativeRows).toHaveLength(1);
    expect(resolved.authoritativeNativeRows[0].id).toBe('native-rev-3');

    const evaluation = evaluateRawRefuelNativeFallbackConvergence({
      candidate: cand,
      nativeRefuelRows: resolved.authoritativeNativeRows,
    });
    expect(evaluation.classification).toBe('SAME_NATIVE');
    expect(evaluation.shouldConvergeToNative).toBe(true);
    expect(evaluation.failClosed).toBe(false);
    expect(evaluation.authoritativeSameNativeEventId).toBe('native-rev-3');
  });

  it('pending reconciliation — provisional component matching candidate yields no authoritative rows', () => {
    const groupId = 'veh-test:pending-component';
    const rev = nativeRevision({
      id: 'native-pending-1',
      dimoSegmentId: 'dimo-pending-1',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:15:27.000Z',
      fuelStart: 5,
      fuelEnd: 18,
      fuelDelta: 13,
    });
    const loaded = [
      {
        ...rev,
        refuelReconciliation: reconFor(rev, {
          groupId,
          finalityState: PhysicalRefuelFinalityState.PROVISIONAL,
          enrichmentEligible: false,
          canonicalEventId: rev.id,
        }),
      },
    ];
    const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
      candidate: cand,
      loadedNativeEvents: loaded,
    });
    expect(resolved.status).toBe('PENDING_RECONCILIATION');
    expect(resolved.detail).toBe(NATIVE_PHYSICAL_RECONCILIATION_NOT_FINAL_DETAIL);
    expect(resolved.authoritativeNativeRows).toHaveLength(0);

    const evaluation = evaluateRawRefuelNativeFallbackConvergence({
      candidate: cand,
      nativeRefuelRows: resolved.authoritativeNativeRows,
    });
    expect(evaluation.classification).toBe('NO_NATIVE_SIBLINGS');
    expect(evaluation.shouldConvergeToNative).toBe(false);
    expect(evaluation.failClosed).toBe(false);
  });

  it('authority conflict — two enrichment-eligible finals in one component', () => {
    const groupId = 'veh-test:conflict-component';
    const a = nativeRevision({
      id: 'native-conflict-a',
      dimoSegmentId: 'dimo-a',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:12:00.000Z',
      fuelStart: 5,
      fuelEnd: 16,
      fuelDelta: 11,
    });
    const b = nativeRevision({
      id: 'native-conflict-b',
      dimoSegmentId: 'dimo-b',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:15:27.000Z',
      fuelStart: 5,
      fuelEnd: 18,
      fuelDelta: 13,
    });
    const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
      candidate: cand,
      loadedNativeEvents: [
        {
          ...a,
          refuelReconciliation: reconFor(a, {
            groupId,
            finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
            enrichmentEligible: true,
            canonicalEventId: a.id,
          }),
        },
        {
          ...b,
          refuelReconciliation: reconFor(b, {
            groupId,
            finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
            enrichmentEligible: true,
            canonicalEventId: b.id,
          }),
        },
      ],
    });
    expect(resolved.status).toBe('AUTHORITY_CONFLICT');
    expect(resolved.detail).toBe(PHYSICAL_REFUEL_AUTHORITY_CONFLICT_DETAIL);
    expect(resolved.authoritativeNativeRows).toHaveLength(0);
  });

  it('legacy compatibility — single legacy native row remains matchable', () => {
    const legacy = nativeRevision({
      id: 'legacy-native-1',
      dimoSegmentId: 'dimo-legacy-1',
      startIso: '2026-09-06T09:35:00.000Z',
      endIso: '2026-09-06T09:47:00.000Z',
      fuelStart: 7,
      fuelEnd: 31,
      fuelDelta: 24,
    });
    const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
      candidate: candidate({
        physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
        physicalEvidenceEnd: new Date('2026-09-06T09:47:00.000Z'),
        riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
        riseEndAt: new Date('2026-09-06T09:47:00.000Z'),
        preFuelAbsoluteLiters: 7,
        postFuelAbsoluteLiters: 31,
        deltaAbsoluteLiters: 24,
      }),
      loadedNativeEvents: [{ ...legacy, refuelReconciliation: null }],
    });
    expect(resolved.status).toBe('OK');
    expect(resolved.authoritativeNativeRows).toHaveLength(1);
  });

  it('legacy row shadowed by finalized V2 canonical for same physical episode', () => {
    const groupId = 'veh-test:shadow-legacy';
    const legacy = nativeRevision({
      id: 'legacy-shadowed',
      dimoSegmentId: 'dimo-legacy-shadow',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:15:27.000Z',
      fuelStart: 5,
      fuelEnd: 18,
      fuelDelta: 13,
    });
    const v2Canonical = nativeRevision({
      id: 'v2-canonical',
      dimoSegmentId: 'dimo-v2-canonical',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:15:27.000Z',
      fuelStart: 5,
      fuelEnd: 18,
      fuelDelta: 13,
    });
    const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
      candidate: cand,
      loadedNativeEvents: [
        { ...legacy, refuelReconciliation: null },
        {
          ...v2Canonical,
          refuelReconciliation: reconFor(v2Canonical, {
            groupId,
            finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
            enrichmentEligible: true,
            canonicalEventId: v2Canonical.id,
          }),
        },
      ],
    });
    expect(resolved.authoritativeNativeRows).toHaveLength(1);
    expect(resolved.authoritativeNativeRows[0].id).toBe('v2-canonical');
  });
});
