import {
  reconcilePhysicalRefuelBatch,
  simulateArrivalOrder,
  buildPhysicalRefuelReconciliationLockKey,
  G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY,
  DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
} from './physical-refuel-reconciliation.design';
import * as identityMatcher from './physical-refuel-identity.matcher';
import {
  classifyPhysicalRefuelSibling,
  chooseCanonicalRefuel,
  compareCanonicalRefuelCandidates,
  HISTORICAL_REFUEL_CALIBRATION_ROWS,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';
import { pairKey } from './physical-refuel-identity-component.design';

describe('physical refuel reconciliation design (G1.2c)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
  const vehicleId = incidentA.vehicleId;
  const endTime = incidentA.endTime;
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const t0 = 1_700_000_000_000;

  function row(
    id: string,
    fuelStart: number,
    fuelEnd: number,
    startTime: string,
    overrides: Partial<RefuelRowForMatcher> = {},
  ): RefuelRowForMatcher {
    return {
      id,
      vehicleId,
      kind: 'REFUEL',
      startTime,
      endTime,
      fuelStartLiters: fuelStart,
      fuelEndLiters: fuelEnd,
      fuelDeltaLiters: fuelEnd - fuelStart,
      fuelStartPercent: fuelStart,
      fuelEndPercent: fuelEnd,
      durationSeconds: 300,
      dimoSegmentId: `seg-${id}`,
      ...overrides,
    };
  }

  function closedContext(
    rows: RefuelRowForMatcher[],
    observedAtById: Record<string, number>,
    asOfMs: number,
  ) {
    return { asOfMs, firstObservedAtById: observedAtById };
  }

  it('defines G2 boundary with identity matrix + observation-time settlement', () => {
    expect(G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.stages.stage3).toContain('observation');
    expect(G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases).toContain(
      'build_pairwise_identity_matrix',
    );
  });

  it('rejects mixed-vehicle batch', () => {
    const other = { ...incidentA, id: 'mixed-v', vehicleId: 'other-vehicle' };
    const batch = reconcilePhysicalRefuelBatch([incidentA, other], {
      firstObservedAtById: { [incidentA.id]: t0, [other.id]: t0 },
      asOfMs: t0,
    });
    expect(batch).toHaveLength(1);
    expect(batch[0].reasonCodes).toContain('mixed_vehicle_batch');
    expect(batch[0].enrichmentEligibleId).toBeNull();
  });

  it('missing firstObservedAt fails closed for entire batch', () => {
    const batch = reconcilePhysicalRefuelBatch([incidentA], { asOfMs: t0 });
    expect(batch[0].reasonCodes).toContain('missing_system_observation_time');
    expect(batch[0].enrichmentEligibleId).toBeNull();
  });

  describe('settlement / finality (G1.2c)', () => {
    it('1. singleton inside horizon → PROVISIONAL', () => {
      const batch = reconcilePhysicalRefuelBatch(
        [incidentA],
        closedContext([incidentA], { [incidentA.id]: t0 }, t0 + 30 * 60 * 1000),
      );
      expect(batch[0].finalityState).toBe('PROVISIONAL');
      expect(batch[0].enrichmentEligibleId).toBeNull();
    });

    it('2. two SAME siblings inside horizon → SETTLING', () => {
      const batch = reconcilePhysicalRefuelBatch(
        [incidentA, incidentB],
        closedContext(
          [incidentA, incidentB],
          { [incidentA.id]: t0, [incidentB.id]: t0 + 20 * 60 * 1000 },
          t0 + 25 * 60 * 1000,
        ),
      );
      expect(batch).toHaveLength(1);
      expect(batch[0].finalityState).toBe('SETTLING');
      expect(batch[0].enrichmentEligibleId).toBeNull();
      expect(batch[0].provisionalCanonicalId).toBe(incidentA.id);
    });

    it('3. three SAME siblings inside horizon → SETTLING', () => {
      const c = row('c-sib', 15, 28, '2026-09-04T03:46:00.000Z', {
        fuelStartPercent: 34.51,
        fuelEndPercent: 43.14,
        odometerEndKm: 187740,
      });
      const batch = reconcilePhysicalRefuelBatch(
        [incidentA, incidentB, c],
        closedContext(
          [incidentA, incidentB, c],
          {
            [incidentA.id]: t0,
            [incidentB.id]: t0 + 20 * 60 * 1000,
            [c.id]: t0 + 40 * 60 * 1000,
          },
          t0 + 45 * 60 * 1000,
        ),
      );
      expect(batch).toHaveLength(1);
      expect(batch[0].finalityState).toBe('SETTLING');
      expect(batch[0].enrichmentEligibleId).toBeNull();
    });

    it('4. after horizon → FINAL_CANONICAL with exactly one enrichmentEligibleId', () => {
      const latest = t0 + 40 * 60 * 1000;
      const batch = reconcilePhysicalRefuelBatch(
        [incidentA, incidentB],
        closedContext(
          [incidentA, incidentB],
          { [incidentA.id]: t0, [incidentB.id]: t0 + 20 * 60 * 1000 },
          latest + horizon + 1,
        ),
      );
      expect(batch[0].finalityState).toBe('FINAL_CANONICAL');
      expect(batch[0].enrichmentEligibleId).toBe(incidentA.id);
      expect(batch[0].canonicalEventId).toBe(incidentA.id);
    });

    it('5. singleton after horizon → FINAL_DISTINCT', () => {
      const batch = reconcilePhysicalRefuelBatch(
        [incidentA],
        closedContext([incidentA], { [incidentA.id]: t0 }, t0 + horizon + 1),
      );
      expect(batch[0].finalityState).toBe('FINAL_DISTINCT');
      expect(batch[0].enrichmentEligibleId).toBe(incidentA.id);
    });
  });

  describe('2→3 sibling race', () => {
    const c = row('c-race', 15, 28, '2026-09-04T03:46:00.000Z', {
      fuelStartPercent: 34.51,
      fuelEndPercent: 43.14,
      odometerEndKm: 187740,
    });
    const all = [incidentA, incidentB, c];
    const observed = {
      [incidentA.id]: t0,
      [incidentB.id]: t0 + 20 * 60 * 1000,
      [c.id]: t0 + 40 * 60 * 1000,
    };
    const finalAsOf = t0 + 40 * 60 * 1000 + horizon + 1;

    function finalOutcome(order: RefuelRowForMatcher[]) {
      const steps: string[] = [];
      for (let minute of [0, 20, 40]) {
        const visible = order.filter((r) => {
          const obs = observed[r.id];
          return obs <= t0 + minute * 60 * 1000 + (minute === 0 ? 0 : 1);
        });
        if (!visible.length) continue;
        const asOf = t0 + minute * 60 * 1000 + (minute < 40 ? 0 : horizon + 1);
        const batch = reconcilePhysicalRefuelBatch(visible, closedContext(visible, observed, asOf));
        const d = batch.find((b) => b.siblingEventIds.length > 1) ?? batch[0];
        steps.push(`${minute}m:${d.finalityState}`);
      }
      const final = reconcilePhysicalRefuelBatch(all, closedContext(all, observed, finalAsOf));
      return { steps, final };
    }

    it('6–9. A→B→C, B→C→A, C→A→B, same batch converge to FINAL_CANONICAL on A', () => {
      const orders = [
        [incidentA, incidentB, c],
        [incidentB, c, incidentA],
        [c, incidentA, incidentB],
      ];
      const finals = orders.map((order) => {
        const result = simulateArrivalOrder(all, order, {
          firstObservedAtById: observed,
        });
        const closed = reconcilePhysicalRefuelBatch(all, closedContext(all, observed, finalAsOf));
        return { incremental: result, closed };
      });

      const sameBatch = reconcilePhysicalRefuelBatch(all, closedContext(all, observed, finalAsOf));

      for (const { incremental, closed } of finals) {
        expect(incremental).toHaveLength(1);
        expect(incremental[0].finalityState).toBe('SETTLING');
        expect(incremental[0].enrichmentEligibleId).toBeNull();
      }

      expect(sameBatch[0].finalityState).toBe('FINAL_CANONICAL');
      expect(sameBatch[0].enrichmentEligibleId).toBe(incidentA.id);
      expect(sameBatch[0].canonicalEventId).toBe(incidentA.id);

      for (const { closed } of finals) {
        expect(closed[0].enrichmentEligibleId).toBe(incidentA.id);
      }
    });

    it('A+B visible while window open must NOT be FINAL_CANONICAL', () => {
      const batch = reconcilePhysicalRefuelBatch(
        [incidentA, incidentB],
        closedContext(
          [incidentA, incidentB],
          { [incidentA.id]: t0, [incidentB.id]: t0 + 20 * 60 * 1000 },
          t0 + 30 * 60 * 1000,
        ),
      );
      expect(batch[0].finalityState).toBe('SETTLING');
      expect(batch[0].finalityState).not.toBe('FINAL_CANONICAL');
    });
  });

  describe('non-transitive ambiguity', () => {
    const rowA = row('a-nt', 5, 28, '2026-09-04T03:40:00.000Z');
    const rowB = row('b-nt', 21, 28, '2026-09-04T03:45:00.000Z');
    const rowC = row('c-nt', 10, 25, '2026-09-04T03:42:00.000Z');
    const permutations = [
      [rowA, rowB, rowC],
      [rowA, rowC, rowB],
      [rowB, rowA, rowC],
      [rowB, rowC, rowA],
      [rowC, rowA, rowB],
      [rowC, rowB, rowA],
    ];

    beforeEach(() => {
      jest.spyOn(identityMatcher, 'classifyPhysicalRefuelSibling').mockImplementation((a, b) => {
        const pair = pairKey(a.id, b.id);
        if (pair === 'a-nt|b-nt' || pair === 'b-nt|c-nt') {
          return { classification: 'SAME_PHYSICAL_REFUEL', reason: 'mock_same' };
        }
        if (pair === 'a-nt|c-nt') {
          return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'mock_distinct' };
        }
        return classifyPhysicalRefuelSibling(a, b);
      });
    });

    afterEach(() => jest.restoreAllMocks());

    it('10. all six permutations → INSUFFICIENT, zero enrichment', () => {
      const obs = { [rowA.id]: t0, [rowB.id]: t0, [rowC.id]: t0 };
      const outcomes = permutations.map((perm) =>
        reconcilePhysicalRefuelBatch(perm, closedContext(perm, obs, t0 + horizon + 1)),
      );
      for (const batch of outcomes) {
        expect(batch).toHaveLength(1);
        expect(batch[0].finalityState).toBe('INSUFFICIENT_EVIDENCE');
        expect(batch[0].enrichmentEligibleId).toBeNull();
        expect(batch[0].reasonCodes).toContain('non_transitive_identity_component');
      }
      for (const outcome of outcomes) {
        expect(outcome).toEqual(outcomes[0]);
      }
    });
  });

  describe('distinct grouping', () => {
    it('11. A~B + C distinct → [A,B] canonical + [C] distinct after settlement', () => {
      const rowA = row('a-d', 5, 28, '2026-09-04T03:40:00.000Z');
      const rowB = row('b-d', 21, 28, '2026-09-04T03:45:00.000Z');
      const rowC = row('c-d', 5, 20, '2026-09-02T10:00:00.000Z', {
        endTime: '2026-09-02T10:10:00.000Z',
      });
      const obs = { [rowA.id]: t0, [rowB.id]: t0, [rowC.id]: t0 };
      const batch = reconcilePhysicalRefuelBatch(
        [rowA, rowB, rowC],
        closedContext([rowA, rowB, rowC], obs, t0 + horizon + 1),
      );
      expect(batch).toHaveLength(2);
      const sibling = batch.find((d) => d.classification === 'SAME_PHYSICAL_REFUEL');
      const distinct = batch.find((d) => d.classification === 'DISTINCT_PHYSICAL_REFUEL');
      expect(sibling?.finalityState).toBe('FINAL_CANONICAL');
      expect(distinct?.finalityState).toBe('FINAL_DISTINCT');
    });
  });

  describe('late sibling after finalization', () => {
    it('15. A FINAL_DISTINCT then B SAME → B not enrichment eligible', () => {
      const obsA = t0;
      const obsB = t0 + horizon + 60_000;
      const batch = reconcilePhysicalRefuelBatch(
        [incidentA, incidentB],
        {
          asOfMs: obsB,
          firstObservedAtById: { [incidentA.id]: obsA, [incidentB.id]: obsB },
          priorDistinctFinalizationIds: new Set([incidentA.id]),
        },
      );
      expect(batch[0].enrichmentEligibleId).toBeNull();
      expect(batch[0].reasonCodes).toContain('late_sibling_after_finalization');
    });

    it('16. A FINAL_DISTINCT then B INSUFFICIENT → fail closed', () => {
      const sparseB: RefuelRowForMatcher = {
        id: 'sparse-b',
        vehicleId,
        kind: 'REFUEL',
        startTime: incidentB.startTime,
        endTime,
        dimoSegmentId: 'sparse-seg',
      };
      jest.spyOn(identityMatcher, 'classifyPhysicalRefuelSibling').mockImplementation((a, b) => {
        if (a.id === incidentA.id && b.id === sparseB.id) {
          return { classification: 'INSUFFICIENT_EVIDENCE', reason: 'sparse' };
        }
        return classifyPhysicalRefuelSibling(a, b);
      });

      const batch = reconcilePhysicalRefuelBatch(
        [incidentA, sparseB],
        {
          asOfMs: t0 + horizon + 60_000,
          firstObservedAtById: { [incidentA.id]: t0, [sparseB.id]: t0 + horizon + 60_000 },
          priorDistinctFinalizationIds: new Set([incidentA.id]),
        },
      );
      const sparseDecision = batch.find((d) => d.siblingEventIds.includes(sparseB.id));
      expect(sparseDecision?.enrichmentEligibleId).toBeNull();
      jest.restoreAllMocks();
    });
  });

  describe('Sept04 regressions', () => {
    it('18–19. A+B SAME, canonical A after settlement closed', () => {
      const obs = {
        [incidentA.id]: t0,
        [incidentB.id]: t0 + 45 * 60 * 1000,
      };
      const batch = reconcilePhysicalRefuelBatch(
        [incidentA, incidentB],
        closedContext([incidentA, incidentB], obs, t0 + 45 * 60 * 1000 + horizon + 1),
      );
      expect(batch[0].classification).toBe('SAME_PHYSICAL_REFUEL');
      expect(batch[0].canonicalEventId).toBe(incidentA.id);
      expect(chooseCanonicalRefuel(incidentA, incidentB)).toBe(incidentA.id);
    });

    it('22. unrelated refuels remain distinct', () => {
      const sep = HISTORICAL_REFUEL_CALIBRATION_ROWS[4];
      const other = HISTORICAL_REFUEL_CALIBRATION_ROWS[5];
      const batch = reconcilePhysicalRefuelBatch(
        [sep, other],
        closedContext([sep, other], { [sep.id]: t0, [other.id]: t0 }, t0 + horizon + 1),
      );
      expect(batch).toHaveLength(2);
      expect(batch.every((d) => d.finalityState === 'FINAL_DISTINCT')).toBe(true);
    });
  });

  describe('property / symmetry', () => {
    it('canonical comparator antisymmetry', () => {
      const ab = compareCanonicalRefuelCandidates(incidentA, incidentB);
      const ba = compareCanonicalRefuelCandidates(incidentB, incidentA);
      expect(ab).toBe(-ba);
    });

    it('input-order independence for Sept04 A+B closed batch', () => {
      const ctx = closedContext(
        [incidentA, incidentB],
        { [incidentA.id]: t0, [incidentB.id]: t0 + 45 * 60 * 1000 },
        t0 + 45 * 60 * 1000 + horizon + 1,
      );
      expect(reconcilePhysicalRefuelBatch([incidentA, incidentB], ctx)).toEqual(
        reconcilePhysicalRefuelBatch([incidentB, incidentA], ctx),
      );
    });

    it('vehicle lock identical for semantic siblings', () => {
      expect(buildPhysicalRefuelReconciliationLockKey(incidentA.vehicleId)).toBe(
        buildPhysicalRefuelReconciliationLockKey(incidentB.vehicleId),
      );
    });
  });
});
