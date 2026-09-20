import {
  FuelStationEnrichmentProcessingStatus,
  FuelStationEnrichmentResolutionStatus,
  PhysicalRefuelFinalityState,
} from '@prisma/client';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';
import { reconcilePhysicalRefuelBatch } from './physical-refuel-reconciliation.design';
import { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG } from './physical-refuel-settlement.design';
import {
  evaluateIrreversibleCanonicalPinning,
  IRREVERSIBLE_CANONICAL_PINNED_REASON,
  isAuthorityRecheckEligibleRow,
  isIrreversibleEnrichmentConsumption,
  isSafeLateSiblingAuthorityRecheckRow,
} from './physical-refuel-late-sibling-authority.util';
import { shouldIncludeRefuelInEnqueuePlan } from './physical-refuel-enqueue-plan.util';
import { resolveAuthoritativeNativeRefuelSiblingsFromLoaded } from './raw-fuel-refuel-fallback/authoritative-native-refuel-siblings.resolver';
import { evaluateRawRefuelNativeFallbackConvergence } from './raw-fuel-refuel-fallback/raw-refuel-native-fallback-convergence.evaluator';
import { projectCanonicalProductEnergyEvents } from './canonical-energy-events.projection';
import { EnergyEventKind, type RawRefuelCandidate } from '@prisma/client';

const WOB_OWNER_ID = 'cafd8fdf-6c72-42c2-9897-2a279c3fae58';

describe('F10.6.8-A.1 irreversible canonical pinning', () => {
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
  const t0 = Date.parse('2026-09-04T03:26:00.000Z');

  function candidate(): RawRefuelCandidate {
    return {
      id: 'rfrf-cand-wob-shape',
      organizationId: 'org-test',
      vehicleId: 'veh-test',
      candidateIdentityKey: 'identity-wob-shape',
      lifecycleState: 'READY_FOR_PERSIST',
      physicalEvidenceStart: new Date('2026-09-19T15:40:26.000Z'),
      physicalEvidenceEnd: new Date('2026-09-19T16:58:31.000Z'),
    } as RawRefuelCandidate;
  }

  describe('pre-A.1 WOB selector audit', () => {
    const wobOwnerRow = {
      enrichmentEnqueuedAt: new Date('2026-09-19T16:30:00.000Z'),
      fuelStationEnrichment: {
        processingStatus: FuelStationEnrichmentProcessingStatus.COMPLETED,
        resolutionStatus: FuelStationEnrichmentResolutionStatus.NOT_FOUND,
      },
    };

    it('WOB owner is irreversible and not safe-recheck pre-A.1', () => {
      expect(isIrreversibleEnrichmentConsumption(wobOwnerRow)).toBe(true);
      const stuckRow = {
        finalityState: PhysicalRefuelFinalityState.INSUFFICIENT_EVIDENCE,
        lateSiblingConflict: true,
        reason: 'late_sibling_after_finalization',
        reasonCodes: ['late_sibling_after_finalization'],
        canonicalEventId: WOB_OWNER_ID,
        enrichmentEnqueuedAt: null,
        fuelStationEnrichment: null,
      };
      expect(isSafeLateSiblingAuthorityRecheckRow(stuckRow, wobOwnerRow)).toBe(false);
      expect(isAuthorityRecheckEligibleRow(stuckRow, wobOwnerRow)).toBe(true);
    });
  });

  describe('WOB-shaped pinning', () => {
    const c = {
      ...incidentA,
      id: 'c-race',
      dimoSegmentId: 'sparse-seg-c',
      fuelStartLiters: 15,
      fuelEndLiters: 28,
      startTime: '2026-09-04T03:46:00.000Z',
      endTime: '2026-09-04T03:56:00.000Z',
    };
    const owner = { ...incidentA, id: 'owner-a' };
    const revB = { ...incidentB, id: 'rev-b' };
    const revC = { ...c, id: 'rev-c' };
    const all = [owner, revB, revC];
    const observed = {
      [owner.id]: t0,
      [revB.id]: t0 + 20 * 60 * 1000,
      [revC.id]: t0 + 40 * 60 * 1000,
    };
    const finalAsOf = t0 + 40 * 60 * 1000 + horizon + 1;

    it('pins FINAL_CANONICAL to consumed owner without new enqueue', () => {
      const batch = reconcilePhysicalRefuelBatch(all, {
        asOfMs: finalAsOf,
        firstObservedAtById: observed,
        settlementConfig: { settlementHorizonMs: horizon },
        priorCanonicalFinalizationIds: new Set([owner.id]),
        priorFinalRowsById: { [owner.id]: owner },
        irreversiblePriorFinalOwnerIds: new Set([owner.id]),
        persistedLateSiblingCanonicalEventId: owner.id,
      });
      expect(batch).toHaveLength(1);
      expect(batch[0].finalityState).toBe('FINAL_CANONICAL');
      expect(batch[0].canonicalEventId).toBe(owner.id);
      expect(batch[0].enrichmentEligibleId).toBe(owner.id);
      expect(batch[0].reason).toBe(IRREVERSIBLE_CANONICAL_PINNED_REASON);
      expect(batch[0].reasonCodes).toContain('late_sibling_after_finalization');

      const pinnedOwnerNewEnqueueCount = shouldIncludeRefuelInEnqueuePlan({
        fuelStationEnrichment: {
          processingStatus: FuelStationEnrichmentProcessingStatus.COMPLETED,
          resolutionStatus: FuelStationEnrichmentResolutionStatus.NOT_FOUND,
        } as never,
        enrichmentEnqueuedAt: new Date('2026-09-19T16:30:00.000Z'),
        asOfMs: finalAsOf,
      })
        ? 1
        : 0;
      expect(pinnedOwnerNewEnqueueCount).toBe(0);
    });

    it('is idempotent on second reconcile pass', () => {
      const ctx = {
        asOfMs: finalAsOf,
        firstObservedAtById: observed,
        settlementConfig: { settlementHorizonMs: horizon },
        priorCanonicalFinalizationIds: new Set([owner.id]),
        priorFinalRowsById: { [owner.id]: owner },
        irreversiblePriorFinalOwnerIds: new Set([owner.id]),
        persistedLateSiblingCanonicalEventId: owner.id,
      };
      const first = reconcilePhysicalRefuelBatch(all, ctx);
      const second = reconcilePhysicalRefuelBatch(all, ctx);
      expect(second).toEqual(first);
    });
  });

  describe('fail-closed negatives', () => {
    it('rejects canonical change A consumed → B chosen', () => {
      const ownerB = { ...incidentB, id: 'consumed-owner-b' };
      const canonicalA = { ...incidentA, id: 'chosen-canonical-a' };
      const lateC = {
        ...incidentA,
        id: 'late-c',
        dimoSegmentId: 'late-seg-c',
        startTime: incidentB.startTime,
        endTime: incidentB.endTime,
      };
      const observed = {
        [canonicalA.id]: t0,
        [ownerB.id]: t0 + 10 * 60 * 1000,
        [lateC.id]: t0 + 40 * 60 * 1000,
      };
      const batch = reconcilePhysicalRefuelBatch([canonicalA, ownerB, lateC], {
        asOfMs: t0 + 40 * 60 * 1000 + horizon + 1,
        firstObservedAtById: observed,
        settlementConfig: { settlementHorizonMs: horizon },
        priorCanonicalFinalizationIds: new Set([ownerB.id]),
        irreversiblePriorFinalOwnerIds: new Set([ownerB.id]),
        persistedLateSiblingCanonicalEventId: ownerB.id,
      });
      expect(batch[0].finalityState).toBe('INSUFFICIENT_EVIDENCE');
      expect(batch[0].enrichmentEligibleId).toBeNull();
      expect(batch[0].reasonCodes).toContain('late_sibling_after_finalization');
    });

    it('rejects multiple irreversible owners in one component', () => {
      const a = { ...incidentA, id: 'irr-a' };
      const b = { ...incidentB, id: 'irr-b', startTime: incidentA.startTime, endTime: incidentA.endTime };
      const pin = evaluateIrreversibleCanonicalPinning({
        component: {
          memberIds: [a.id, b.id],
          members: [a, b],
          status: 'VALID_COMPLETE_CLIQUE',
          isCompleteSameClique: true,
          reasonCodes: [],
        },
        chosenCanonicalId: a.id,
        asOfMs: t0 + horizon + 1,
        firstObservedAtById: { [a.id]: t0, [b.id]: t0 },
        irreversiblePriorFinalOwnerIds: new Set([a.id, b.id]),
        priorCanonicalFinalizationIds: new Set([a.id, b.id]),
        persistedCanonicalEventId: a.id,
      });
      expect(pin.pin).toBe(false);
    });
  });

  describe('Stage4 / product after pin', () => {
    it('one authoritative native and one product refuel', () => {
      const groupId = 'veh-test:pinned';
      const canonicalId = 'native-rev-3';
      const base = {
        vehicleId: 'veh-test',
        kind: EnergyEventKind.REFUEL,
        detectionSource: 'DIMO_NATIVE',
      };
      const loaded = ['native-rev-1', 'native-rev-2', canonicalId].map((id, i) => ({
        id,
        ...base,
        dimoSegmentId: `dimo-${i}`,
        startTime: new Date('2026-09-19T16:09:00.000Z'),
        endTime: new Date('2026-09-19T16:15:27.000Z'),
        fuelDeltaLiters: 13,
        rawDetectionMeta: { fuelStartLiters: 5, fuelEndLiters: 18 },
        createdAt: new Date('2026-09-19T16:09:00.000Z'),
        refuelReconciliation: {
          reconciliationGroupId: groupId,
          finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
          enrichmentEligible: id === canonicalId,
          canonicalEventId: canonicalId,
          classification: 'SAME_PHYSICAL_REFUEL',
          lateSiblingConflict: true,
          reason: IRREVERSIBLE_CANONICAL_PINNED_REASON,
          reasonCodes: ['late_sibling_after_finalization'],
        },
      }));

      const resolved = resolveAuthoritativeNativeRefuelSiblingsFromLoaded({
        candidate: candidate(),
        loadedNativeEvents: loaded as never,
      });
      expect(resolved.status).toBe('OK');
      expect(resolved.authoritativeNativeRows).toHaveLength(1);
      expect(resolved.authoritativeNativeRows[0].id).toBe(canonicalId);

      const evaluation = evaluateRawRefuelNativeFallbackConvergence({
        candidate: candidate(),
        nativeRefuelRows: resolved.authoritativeNativeRows,
      });
      expect(evaluation.failClosed).toBe(false);

      const product = projectCanonicalProductEnergyEvents(loaded as never, new Date('2026-09-04T12:00:00.000Z'));
      const refuels = product.filter((r) => r.kind === EnergyEventKind.REFUEL);
      expect(refuels).toHaveLength(1);
      expect(refuels[0].id).toBe(canonicalId);
    });
  });

  describe('read-only WOB expectation', () => {
    it('WOB pinning preconditions satisfied under F10.6.7.2 evidence', () => {
      expect(WOB_OWNER_ID).toBe('cafd8fdf-6c72-42c2-9897-2a279c3fae58');
      expect(
        isIrreversibleEnrichmentConsumption({
          enrichmentEnqueuedAt: new Date('2026-09-19T16:30:00.000Z'),
          fuelStationEnrichment: {
            processingStatus: FuelStationEnrichmentProcessingStatus.COMPLETED,
            resolutionStatus: FuelStationEnrichmentResolutionStatus.NOT_FOUND,
          },
        }),
      ).toBe(true);
    });
  });
});
