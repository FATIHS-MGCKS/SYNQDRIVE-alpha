jest.mock('./raw-refuel-native-fallback-convergence.evaluator', () => {
  const actual = jest.requireActual('./raw-refuel-native-fallback-convergence.evaluator');
  return {
    ...actual,
    MAX_RAW_NATIVE_REFUEL_ROWS_IN_OVERLAP_WINDOW: 4,
    RAW_NATIVE_REFUEL_SIBLING_LOAD_BATCH: 2,
  };
});

import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type RawRefuelCandidate,
  type VehicleEnergyEvent,
} from '@prisma/client';
import {
  loadAuthoritativeNativeRefuelSiblings,
  resolveAuthoritativeNativeRefuelSiblingsFromLoaded,
  nativePhysicalRelationshipImpliesPendingReconciliation,
} from './authoritative-native-refuel-siblings.resolver';
import { RAW_NATIVE_REFUEL_SIBLING_LOAD_BATCH } from './raw-refuel-native-fallback-convergence.evaluator';
import { classifyPhysicalRefuelSibling } from '../physical-refuel-identity.matcher';
import { vehicleEnergyEventToRefuelRow } from '../physical-refuel-row.mapper';
import { rawRefuelCandidateToRefuelRowForMatcher } from './raw-refuel-native-overlap.advisory';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import { RawRefuelPromotionService } from './raw-refuel-promotion.service';
import {
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV } from '@config/physical-refuel-reconciliation.config';

function candidate(overrides: Partial<RawRefuelCandidate> = {}): RawRefuelCandidate {
  return {
    id: 'rfrf-cand-b2',
    organizationId: 'org-test',
    vehicleId: 'veh-test',
    candidateIdentityKey: 'identity-b2',
    detectionVersion: 'rfrf-rise-v1',
    detectorVersion: 'rfrf-rise-detector-v1',
    signalChannel: 'ABSOLUTE_LITERS',
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    evidenceRevisionFingerprint: 'fp-b2',
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
    absoluteSignalTrust: 'TRUSTED',
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

function nativeRow(input: {
  id: string;
  dimoSegmentId: string;
  startIso: string;
  endIso: string;
  fuelDelta: number;
  rawDetectionMeta?: Record<string, unknown>;
  createdAtIso?: string;
}) {
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
    rawDetectionMeta: input.rawDetectionMeta ?? {
      fuelStartLiters: 5,
      fuelEndLiters: 18,
    },
    createdAt: new Date(input.createdAtIso ?? '2026-09-19T16:20:00.000Z'),
    updatedAt: new Date(input.createdAtIso ?? '2026-09-19T16:20:00.000Z'),
    refuelReconciliation: null,
  } as unknown as VehicleEnergyEvent & { refuelReconciliation: null };
}

describe('F10.6.6-B.2 authoritative loader + pending INSUFFICIENT', () => {
  const v2Cutover = new Date('2026-09-04T12:00:00.000Z');
  const cand = candidate();

  it('loadAuthoritativeNativeRefuelSiblings paginates and finds canonical after first batch', async () => {
    const groupId = 'veh-test:paginated-canonical';
    const decoysPage1 = Array.from({ length: RAW_NATIVE_REFUEL_SIBLING_LOAD_BATCH }, (_, index) =>
      nativeRow({
        id: `decoy-${index}`,
        dimoSegmentId: `dimo-decoy-${index}`,
        startIso: `2026-09-19T10:${String(index).padStart(2, '0')}:00.000Z`,
        endIso: `2026-09-19T10:${String(index).padStart(2, '0')}:30.000Z`,
        fuelDelta: 1,
        rawDetectionMeta: { fuelStartLiters: 1, fuelEndLiters: 2 },
        createdAtIso: '2026-09-19T16:00:00.000Z',
      }),
    );
    const canonical = nativeRow({
      id: 'canonical-page-2',
      dimoSegmentId: 'dimo-canonical-page-2',
      startIso: '2026-09-19T16:09:00.000Z',
      endIso: '2026-09-19T16:15:27.000Z',
      fuelDelta: 13,
      createdAtIso: '2026-09-05T00:00:00.000Z',
    });
    (canonical as { refuelReconciliation: unknown }).refuelReconciliation = {
      energyEventId: canonical.id,
      vehicleId: 'veh-test',
      reconciliationGroupId: groupId,
      finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
      canonicalEventId: canonical.id,
      enrichmentEligible: true,
    };

    let findManyCalls = 0;
    const tx = {
      vehicleEnergyEvent: {
        findMany: jest.fn(async () => {
          findManyCalls++;
          if (findManyCalls === 1) return decoysPage1;
          if (findManyCalls === 2) return [canonical];
          return [];
        }),
      },
    };

    const result = await loadAuthoritativeNativeRefuelSiblings(
      tx as never,
      cand,
      {
        start: new Date('2026-09-19T09:00:00.000Z'),
        end: new Date('2026-09-19T18:00:00.000Z'),
      },
      { [PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV]: v2Cutover.toISOString() },
    );

    expect(findManyCalls).toBeGreaterThanOrEqual(2);
    expect(result.status).toBe('OK');
    expect(result.authoritativeNativeRows).toHaveLength(1);
    expect(result.authoritativeNativeRows[0].id).toBe('canonical-page-2');
  });

  it('loadAuthoritativeNativeRefuelSiblings returns RAW_LOAD_INCOMPLETE when raw bound exceeded', async () => {
    const tx = {
      vehicleEnergyEvent: {
        findMany: jest.fn(async () => [
          nativeRow({
            id: 'row-1',
            dimoSegmentId: 'd1',
            startIso: '2026-09-19T10:00:00.000Z',
            endIso: '2026-09-19T10:01:00.000Z',
            fuelDelta: 1,
            createdAtIso: '2026-09-01T00:00:00.000Z',
          }),
          nativeRow({
            id: 'row-2',
            dimoSegmentId: 'd2',
            startIso: '2026-09-19T10:02:00.000Z',
            endIso: '2026-09-19T10:03:00.000Z',
            fuelDelta: 1,
            createdAtIso: '2026-09-01T00:00:00.000Z',
          }),
        ]),
      },
    };

    const result = await loadAuthoritativeNativeRefuelSiblings(
      tx as never,
      cand,
      { start: new Date('2026-09-19T09:00:00.000Z'), end: new Date('2026-09-19T18:00:00.000Z') },
    );

    expect(result.status).toBe('RAW_LOAD_INCOMPLETE');
    expect(result.detail).toBe('native_sibling_raw_load_incomplete');
    expect(result.authoritativeNativeRows).toHaveLength(0);
  });

  it('V2 unreconciled INSUFFICIENT_EVIDENCE → PENDING_RECONCILIATION', () => {
    const ambiguous = nativeRow({
      id: 'v2-unrecon-insufficient',
      dimoSegmentId: 'dimo-insufficient',
      startIso: '2026-09-19T16:10:00.000Z',
      endIso: '2026-09-19T16:16:00.000Z',
      fuelDelta: 13,
      rawDetectionMeta: { fuelStartLiters: 5 },
    });
    const candidateRow = rawRefuelCandidateToRefuelRowForMatcher(cand);
    const nativeMatcherRow = vehicleEnergyEventToRefuelRow(ambiguous);
    expect(classifyPhysicalRefuelSibling(candidateRow, nativeMatcherRow).classification).toBe(
      'INSUFFICIENT_EVIDENCE',
    );

    const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
      candidate: cand,
      loadedNativeEvents: [ambiguous],
      v2OwnershipCutoverAt: v2Cutover,
    });
    expect(resolved.status).toBe('PENDING_RECONCILIATION');
  });

  it('V2 non-final component INSUFFICIENT_EVIDENCE → PENDING_RECONCILIATION', () => {
    const provisional = nativeRow({
      id: 'v2-provisional-insufficient',
      dimoSegmentId: 'dimo-prov-insufficient',
      startIso: '2026-09-19T16:10:00.000Z',
      endIso: '2026-09-19T16:16:00.000Z',
      fuelDelta: 13,
      rawDetectionMeta: { fuelStartLiters: 5 },
    });
    (provisional as { refuelReconciliation: unknown }).refuelReconciliation = {
      energyEventId: provisional.id,
      vehicleId: 'veh-test',
      reconciliationGroupId: 'veh-test:prov-insufficient',
      finalityState: PhysicalRefuelFinalityState.PROVISIONAL,
      canonicalEventId: provisional.id,
      enrichmentEligible: false,
    };

    const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
      candidate: cand,
      loadedNativeEvents: [provisional],
      v2OwnershipCutoverAt: v2Cutover,
    });
    expect(resolved.status).toBe('PENDING_RECONCILIATION');
  });

  it('nativePhysicalRelationshipImpliesPendingReconciliation ignores DISTINCT only', () => {
    const candidateRow = rawRefuelCandidateToRefuelRowForMatcher(cand);
    const distinctNative = vehicleEnergyEventToRefuelRow(
      nativeRow({
        id: 'distinct-far',
        dimoSegmentId: 'dimo-distinct',
        startIso: '2026-09-19T08:00:00.000Z',
        endIso: '2026-09-19T08:05:00.000Z',
        fuelDelta: 40,
        rawDetectionMeta: { fuelStartLiters: 10, fuelEndLiters: 50 },
        createdAtIso: '2026-09-19T16:20:00.000Z',
      }),
    );
    expect(
      classifyPhysicalRefuelSibling(candidateRow, distinctNative).classification,
    ).toBe('DISTINCT_PHYSICAL_REFUEL');
    expect(
      nativePhysicalRelationshipImpliesPendingReconciliation(candidateRow, distinctNative),
    ).toBe(false);
  });
});

describe('F10.6.6-B.2 RAW_LOAD_INCOMPLETE fail-closed in convergence and promotion', () => {
  const cand = candidate();
  const promotionEnv = {
    [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'true',
    [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'true',
    [PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV]: '2026-09-01T00:00:00.000Z',
    RAW_FUEL_REFUEL_FALLBACK_MASTER_ENABLED: 'true',
    RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED: 'true',
    RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT: '2026-09-01T00:00:00.000Z',
  };

  function buildTxMock() {
    const veeCreate = jest.fn();
    const candidateUpdate = jest.fn();
    return {
      veeCreate,
      candidateUpdate,
      tx: {
        vehicleEnergyEvent: {
          findMany: jest.fn(async () => {
            return [
              nativeRow({
                id: 'overflow-1',
                dimoSegmentId: 'o1',
                startIso: '2026-09-19T10:00:00.000Z',
                endIso: '2026-09-19T10:01:00.000Z',
                fuelDelta: 1,
                createdAtIso: '2026-09-01T00:00:00.000Z',
              }),
              nativeRow({
                id: 'overflow-2',
                dimoSegmentId: 'o2',
                startIso: '2026-09-19T10:02:00.000Z',
                endIso: '2026-09-19T10:03:00.000Z',
                fuelDelta: 1,
                createdAtIso: '2026-09-01T00:00:00.000Z',
              }),
            ];
          }),
          findUnique: jest.fn(async () => null),
          create: veeCreate,
        },
        rawRefuelCandidate: {
          findUnique: jest.fn(async () => cand),
          update: candidateUpdate,
        },
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn(async () => [{ id: cand.id }]),
      },
    };
  }

  it('RawRefuelConvergenceService fail-closed on RAW_LOAD_INCOMPLETE', async () => {
    const { tx } = buildTxMock();
    (tx as { $executeRaw: jest.Mock }).$executeRaw = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      rawRefuelCandidate: { findUnique: jest.fn(async () => cand) },
    };
    const service = new RawRefuelConvergenceService(prisma as never);
    const result = await service.evaluateAndApplyConvergence(cand, {}, promotionEnv);
    expect(result.status).toBe('FAIL_CLOSED');
    expect(result.detail).toBe('native_sibling_raw_load_incomplete');
  });

  it('RawRefuelPromotionService does not create fallback on RAW_LOAD_INCOMPLETE', async () => {
    const { tx, veeCreate, candidateUpdate } = buildTxMock();
    (tx as { $queryRaw: jest.Mock }).$queryRaw = jest.fn(async () => [{ id: cand.id }]);
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      rawRefuelCandidate: { findUnique: jest.fn(async () => cand) },
      vehicleEnergyEvent: { findUnique: jest.fn(async () => null) },
    };
    const service = new RawRefuelPromotionService(prisma as never);
    const result = await service.evaluateAndApplyPromotion(cand, {}, promotionEnv);
    expect(result.status).toBe('FAIL_CLOSED');
    expect(result.fallbackVehicleEnergyEventId).toBeNull();
    expect(veeCreate).not.toHaveBeenCalled();
    expect(candidateUpdate).not.toHaveBeenCalled();
  });

  it('RawRefuelPromotionService does not promote when V2 unreconciled INSUFFICIENT is pending', async () => {
    const ambiguous = nativeRow({
      id: 'v2-unrecon-insufficient-promo',
      dimoSegmentId: 'dimo-insufficient-promo',
      startIso: '2026-09-19T16:10:00.000Z',
      endIso: '2026-09-19T16:16:00.000Z',
      fuelDelta: 13,
      rawDetectionMeta: { fuelStartLiters: 5 },
    });
    const veeCreate = jest.fn();
    const candidateUpdate = jest.fn();
    const tx = {
      $queryRaw: jest.fn(async () => [{ id: cand.id }]),
      $executeRaw: jest.fn(),
      vehicleEnergyEvent: {
        findMany: jest.fn(async () => [ambiguous]),
        findUnique: jest.fn(async () => null),
        create: veeCreate,
      },
      rawRefuelCandidate: {
        findUnique: jest.fn(async () => cand),
        update: candidateUpdate,
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      rawRefuelCandidate: { findUnique: jest.fn(async () => cand) },
      vehicleEnergyEvent: { findUnique: jest.fn(async () => null) },
    };
    const service = new RawRefuelPromotionService(prisma as never);
    const result = await service.evaluateAndApplyPromotion(cand, {}, promotionEnv);
    expect(result.status).toBe('SKIPPED_NO_ACTION');
    expect(result.detail).toBe('native_physical_reconciliation_not_final');
    expect(veeCreate).not.toHaveBeenCalled();
    expect(candidateUpdate).not.toHaveBeenCalled();
  });
});
