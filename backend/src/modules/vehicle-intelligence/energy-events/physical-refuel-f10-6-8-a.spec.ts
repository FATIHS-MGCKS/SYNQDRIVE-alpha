import {
  FuelStationEnrichmentProcessingStatus,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEventRefuelReconciliation,
} from '@prisma/client';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';
import { reconcilePhysicalRefuelBatch } from './physical-refuel-reconciliation.design';
import { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG } from './physical-refuel-settlement.design';
import { extractPriorFinalizationIds } from './physical-refuel-reconciliation.repository';
import { extractDurablePriorFinalOwnerIdsFromLateSiblingRows } from './physical-refuel-prior-ownership.util';
import {
  AUTHORITY_RECHECK_HOLD_REASON,
  isSafeLateSiblingAuthorityRecheckRow,
} from './physical-refuel-late-sibling-authority.util';
import {
  buildAuthorityRecheckRecoveryWhere,
  findPhysicalRefuelRecoveryWork,
} from './physical-refuel-recovery.repository';
import { resolveAuthoritativeNativeRefuelSiblingsFromLoaded } from './raw-fuel-refuel-fallback/authoritative-native-refuel-siblings.resolver';
import { evaluateRawRefuelNativeFallbackConvergence } from './raw-fuel-refuel-fallback/raw-refuel-native-fallback-convergence.evaluator';
import { projectCanonicalProductEnergyEvents } from './canonical-energy-events.projection';
import { EnergyEventKind, type RawRefuelCandidate } from '@prisma/client';

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

describe('F10.6.8-A recoverable late-sibling authority', () => {
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
  const vehicleId = incidentA.vehicleId;
  const t0 = Date.parse('2026-09-04T03:26:00.000Z');

  function closedContext(
    members: typeof HISTORICAL_REFUEL_CALIBRATION_ROWS,
    firstObservedAtById: Record<string, number>,
    asOfMs: number,
  ) {
    return {
      asOfMs,
      firstObservedAtById,
      settlementConfig: { settlementHorizonMs: horizon },
    };
  }

  describe('prior-finalization durable memory', () => {
    it('extractPriorFinalizationIds survives INSUFFICIENT late-sibling overwrite', () => {
      const ownerId = 'canonical-owner';
      const rows = [
        {
          energyEventId: 'seg-a',
          enrichmentEligible: false,
          finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE,
          lateSiblingConflict: true,
          reason: 'late_sibling_after_finalization',
          reasonCodes: ['late_sibling_after_finalization'],
          canonicalEventId: ownerId,
        },
      ] as VehicleEnergyEventRefuelReconciliation[];

      const { priorCanonicalFinalizationIds } = extractPriorFinalizationIds(rows);
      expect(priorCanonicalFinalizationIds.has(ownerId)).toBe(true);
      expect(extractDurablePriorFinalOwnerIdsFromLateSiblingRows(rows).has(ownerId)).toBe(true);
    });
  });

  describe('WOB-shaped safe recovery (Case B)', () => {
    const c = {
      ...incidentA,
      id: 'c-race',
      dimoSegmentId: 'sparse-seg-c',
      fuelStartLiters: 15,
      fuelEndLiters: 28,
      startTime: '2026-09-04T03:46:00.000Z',
      endTime: '2026-09-04T03:56:00.000Z',
    };
    const all = [incidentA, incidentB, c];
    const observed = {
      [incidentA.id]: t0,
      [incidentB.id]: t0 + 20 * 60 * 1000,
      [c.id]: t0 + 40 * 60 * 1000,
    };
    const finalAsOf = t0 + 40 * 60 * 1000 + horizon + 1;

    it('reopens to FINAL_CANONICAL when prior owner was not irreversibly consumed', () => {
      const batch = reconcilePhysicalRefuelBatch(all, {
        ...closedContext(all, observed, finalAsOf),
        priorCanonicalFinalizationIds: new Set([incidentA.id]),
        priorFinalRowsById: { [incidentA.id]: incidentA },
        irreversiblePriorFinalOwnerIds: new Set(),
      });
      expect(batch).toHaveLength(1);
      expect(batch[0].finalityState).toBe('FINAL_CANONICAL');
      expect(batch[0].canonicalEventId).toBe(incidentA.id);
      expect(batch[0].enrichmentEligibleId).toBe(incidentA.id);
      expect(batch[0].reasonCodes).not.toContain('late_sibling_after_finalization');
    });
  });

  describe('irreversible prior consumption (Case A)', () => {
    it('remains fail closed with late_sibling_after_finalization', () => {
      const obsA = t0;
      const obsB = t0 + horizon + 60_000;
      const batch = reconcilePhysicalRefuelBatch([incidentA, incidentB], {
        asOfMs: obsB + horizon + 1,
        firstObservedAtById: { [incidentA.id]: obsA, [incidentB.id]: obsB },
        priorDistinctFinalizationIds: new Set([incidentA.id]),
        priorFinalRowsById: { [incidentA.id]: incidentA },
        irreversiblePriorFinalOwnerIds: new Set([incidentA.id]),
        settlementConfig: { settlementHorizonMs: horizon },
      });
      expect(batch[0].finalityState).toBe('INSUFFICIENT_EVIDENCE');
      expect(batch[0].enrichmentEligibleId).toBeNull();
      expect(batch[0].reasonCodes).toContain('late_sibling_after_finalization');
    });
  });

  describe('permanent identity ambiguity', () => {
    it('is not selected for authority_recheck', () => {
      expect(
        isSafeLateSiblingAuthorityRecheckRow({
          finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE,
          lateSiblingConflict: false,
          reason: 'non_transitive_identity_component',
          reasonCodes: ['non_transitive_identity_component'],
          canonicalEventId: null,
          enrichmentEnqueuedAt: null,
          fuelStationEnrichment: null,
        }),
      ).toBe(false);
    });
  });

  describe('recovery repository authority_recheck', () => {
    const recoveryParams = {
      batchSize: 25,
      asOf: new Date('2026-09-20T04:00:00.000Z'),
      v2OwnershipCutoverAt: new Date('2026-09-04T12:00:00.000Z'),
      orphanLookbackFrom: new Date('2026-09-01T00:00:00.000Z'),
    };

    it('selects safe late-sibling row once as authority_recheck', async () => {
      const ownerId = 'owner-safe';
      const prisma = {
        vehicleEnergyEventRefuelReconciliation: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              {
                vehicleId: 'veh-1',
                energyEventId: 'seg-1',
                canonicalEventId: ownerId,
                finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE,
                lateSiblingConflict: true,
                reason: 'late_sibling_after_finalization',
                reasonCodes: ['late_sibling_after_finalization'],
                enrichmentEnqueuedAt: null,
                energyEvent: { fuelStationEnrichment: null, detectionSource: 'DIMO_NATIVE' },
              },
            ]),
          findUnique: jest.fn().mockResolvedValue({
            energyEventId: ownerId,
            enrichmentEnqueuedAt: null,
            energyEvent: { fuelStationEnrichment: null },
          }),
        },
        vehicleEnergyEvent: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue({ detectionSource: 'DIMO_NATIVE' }),
        },
      };

      const work = await findPhysicalRefuelRecoveryWork(prisma as never, recoveryParams);
      const recheck = work.filter((w) => w.reason === 'authority_recheck');
      expect(recheck).toHaveLength(1);
      expect(recheck[0].triggerEventId).toBe('seg-1');
    });

    it('selects irreversible late-sibling row for authority_recheck evaluation', async () => {
      const ownerId = 'owner-irr';
      const prisma = {
        vehicleEnergyEventRefuelReconciliation: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              {
                vehicleId: 'veh-2',
                energyEventId: 'seg-2',
                canonicalEventId: ownerId,
                finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE,
                lateSiblingConflict: true,
                reason: 'late_sibling_after_finalization',
                reasonCodes: ['late_sibling_after_finalization'],
                enrichmentEnqueuedAt: null,
                energyEvent: { fuelStationEnrichment: null, detectionSource: 'DIMO_NATIVE' },
              },
            ]),
          findUnique: jest.fn().mockResolvedValue({
            energyEventId: ownerId,
            enrichmentEnqueuedAt: new Date('2026-09-19T16:30:00.000Z'),
            energyEvent: { fuelStationEnrichment: null },
          }),
        },
        vehicleEnergyEvent: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn().mockResolvedValue({ detectionSource: 'DIMO_NATIVE' }),
        },
      };

      const work = await findPhysicalRefuelRecoveryWork(prisma as never, recoveryParams);
      expect(work.some((w) => w.reason === 'authority_recheck')).toBe(true);
    });

    it('excludes authority_recheck_hold rows from selector', () => {
      const where = buildAuthorityRecheckRecoveryWhere(false);
      expect(where.reason).toEqual({ not: AUTHORITY_RECHECK_HOLD_REASON });
    });
  });

  describe('Stage4 / product after safe recovery fixture', () => {
    function nativeRevision(input: {
      id: string;
      dimoSegmentId: string;
      startIso: string;
      endIso: string;
      fuelStart: number;
      fuelEnd: number;
      fuelDelta: number;
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
        rawDetectionMeta: {
          fuelStartLiters: input.fuelStart,
          fuelEndLiters: input.fuelEnd,
        },
        createdAt: new Date(input.startIso),
        updatedAt: new Date(input.startIso),
      };
    }

    function reconFor(
      event: { id: string; vehicleId: string },
      input: {
        groupId: string;
        finalityState: PhysicalRefuelFinalityState;
        enrichmentEligible: boolean;
        canonicalEventId: string;
      },
    ) {
      return {
        energyEventId: event.id,
        vehicleId: event.vehicleId,
        reconciliationGroupId: input.groupId,
        classification: 'SAME_PHYSICAL_REFUEL',
        finalityState: input.finalityState,
        canonicalEventId: input.canonicalEventId,
        enrichmentEligible: input.enrichmentEligible,
        lateSiblingConflict: false,
        reason: 'settlement_closed',
        reasonCodes: [],
      };
    }

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
    const loaded = [
      { ...rev1, refuelReconciliation: reconFor(rev1, { groupId, finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL, enrichmentEligible: false, canonicalEventId: canonicalId }) },
      { ...rev2, refuelReconciliation: reconFor(rev2, { groupId, finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL, enrichmentEligible: false, canonicalEventId: canonicalId }) },
      { ...rev3, refuelReconciliation: reconFor(rev3, { groupId, finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL, enrichmentEligible: true, canonicalEventId: canonicalId }) },
    ];

    it('Stage4 SAME_NATIVE and product canonical=1', () => {
      const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
        candidate: candidate(),
        loadedNativeEvents: loaded as never,
      });
      expect(resolved.rawNativeRowCount).toBe(3);
      expect(resolved.physicalRefuelComponentCount).toBe(1);
      expect(resolved.status).toBe('OK');
      expect(resolved.authoritativeNativeRows).toHaveLength(1);

      const evaluation = evaluateRawRefuelNativeFallbackConvergence({
        candidate: candidate(),
        nativeRefuelRows: resolved.authoritativeNativeRows,
      });
      expect(evaluation.classification).toBe('SAME_NATIVE');
      expect(evaluation.shouldConvergeToNative).toBe(true);
      expect(evaluation.failClosed).toBe(false);

      const product = projectCanonicalProductEnergyEvents(loaded as never, new Date('2026-09-04T12:00:00.000Z'));
      const refuels = product.filter((row) => row.kind === EnergyEventKind.REFUEL);
      expect(loaded).toHaveLength(3);
      expect(refuels).toHaveLength(1);
      expect(refuels[0].id).toBe(canonicalId);
    });
  });
});