import {
  reconcilePhysicalRefuelBatch,
  simulateArrivalOrder,
  buildPhysicalRefuelReconciliationLockKey,
  buildPhysicalRefuelScopeKey,
  partitionPhysicalRefuelGroups,
  G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY,
  DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
} from './physical-refuel-reconciliation.design';
import * as identityMatcher from './physical-refuel-identity.matcher';
import {
  classifyPhysicalRefuelSibling,
  HISTORICAL_REFUEL_CALIBRATION_ROWS,
  type RefuelRowForMatcher,
} from './physical-refuel-identity.matcher';
import {
  determinePhysicalRefuelSettlement,
} from './physical-refuel-settlement.design';

describe('physical refuel reconciliation design (G1.2b)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];

  it('defines G2 transaction boundary with finality gate after commit', () => {
    expect(G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases[0]).toBe('BEGIN');
    expect(G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.stages.stage1).toContain('lock');
    expect(G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases).toContain(
      'determine_settlement_finality_state',
    );
    const commitIdx = G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases.indexOf('COMMIT');
    const enrichIdx = G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases.findIndex((p) =>
      p.includes('enqueue_station_enrichment'),
    );
    expect(enrichIdx).toBeGreaterThan(commitIdx);
  });

  it('Stage-1 lock is vehicle-scoped and identical for semantic siblings', () => {
    const lockA = buildPhysicalRefuelReconciliationLockKey(incidentA.vehicleId);
    const lockB = buildPhysicalRefuelReconciliationLockKey(incidentB.vehicleId);
    expect(lockA).toBe(lockB);
    expect(lockA).toBe(`refuel_reconciliation:${incidentA.vehicleId}`);
    expect(buildPhysicalRefuelScopeKey(incidentA)).toBe(lockA);
  });

  it('bucket-boundary fields do not change lock key (minute/fuel/odo rollover safe)', () => {
    const minuteRollover: RefuelRowForMatcher = {
      ...incidentA,
      endTime: '2026-09-04T05:59:59.000Z',
      fuelEndLiters: 27.74,
      odometerEndKm: 187740.49,
    };
    const otherBucket: RefuelRowForMatcher = {
      ...incidentB,
      endTime: '2026-09-04T06:00:01.000Z',
      fuelEndLiters: 27.76,
      odometerEndKm: 187740.51,
    };
    expect(buildPhysicalRefuelReconciliationLockKey(minuteRollover.vehicleId)).toBe(
      buildPhysicalRefuelReconciliationLockKey(otherBucket.vehicleId),
    );
    expect(classifyPhysicalRefuelSibling(minuteRollover, otherBucket).classification).toBe(
      'SAME_PHYSICAL_REFUEL',
    );
  });

  it('arrival order A then B yields FINAL_CANONICAL with enrichment on A only', () => {
    const final = simulateArrivalOrder([incidentA, incidentB], [incidentA, incidentB]);
    expect(final).toHaveLength(1);
    expect(final[0].classification).toBe('SAME_PHYSICAL_REFUEL');
    expect(final[0].canonicalEventId).toBe(incidentA.id);
    expect(final[0].enrichmentEligibleId).toBe(incidentA.id);
    expect(final[0].finalityState).toBe('FINAL_CANONICAL');
    expect(final[0].siblingEventIds).toEqual([incidentA.id, incidentB.id].sort());
  });

  it('arrival order B then A yields identical canonical outcome', () => {
    const orderAFirst = simulateArrivalOrder([incidentA, incidentB], [incidentA, incidentB]);
    const orderBFirst = simulateArrivalOrder([incidentA, incidentB], [incidentB, incidentA]);
    expect(orderBFirst).toEqual(orderAFirst);
  });

  it('same-batch reconciliation is input-order independent', () => {
    const batchAB = reconcilePhysicalRefuelBatch([incidentA, incidentB]);
    const batchBA = reconcilePhysicalRefuelBatch([incidentB, incidentA]);
    expect(batchAB).toEqual(batchBA);
    expect(batchAB[0].canonicalEventId).toBe(incidentA.id);
    expect(batchAB[0].finalityState).toBe('FINAL_CANONICAL');
  });

  it('singleton within settlement horizon is PROVISIONAL (not enrichment-eligible)', () => {
    const firstSeen = new Date(incidentA.endTime).getTime();
    const withinHorizon = firstSeen + 30 * 60 * 1000;
    const batch = reconcilePhysicalRefuelBatch([incidentA], {
      asOfMs: withinHorizon,
      firstSeenAtById: { [incidentA.id]: firstSeen },
    });
    expect(batch).toHaveLength(1);
    expect(batch[0].finalityState).toBe('PROVISIONAL');
    expect(batch[0].enrichmentEligibleId).toBeNull();
  });

  it('singleton after settlement horizon is FINAL_DISTINCT and enrichment-eligible', () => {
    const firstSeen = new Date(incidentA.endTime).getTime();
    const afterHorizon =
      firstSeen + DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs + 1000;
    const batch = reconcilePhysicalRefuelBatch([incidentA], {
      asOfMs: afterHorizon,
      firstSeenAtById: { [incidentA.id]: firstSeen },
    });
    expect(batch[0].finalityState).toBe('FINAL_DISTINCT');
    expect(batch[0].enrichmentEligibleId).toBe(incidentA.id);
  });

  it('late sibling inside settlement window upgrades singleton to FINAL_CANONICAL', () => {
    const firstSeenB = new Date(incidentB.endTime).getTime();
    const whenAArrives = firstSeenB + 45 * 60 * 1000;
    const final = simulateArrivalOrder([incidentA, incidentB], [incidentB, incidentA], {
      firstSeenAtById: {
        [incidentB.id]: firstSeenB,
        [incidentA.id]: whenAArrives,
      },
      asOfMs: whenAArrives,
    });
    expect(final).toHaveLength(1);
    expect(final[0].finalityState).toBe('FINAL_CANONICAL');
    expect(final[0].enrichmentEligibleId).toBe(incidentA.id);
  });

  it('late sibling after distinct settlement fails closed (duplicate enrichment risk)', () => {
    const settlement = determinePhysicalRefuelSettlement({
      group: [incidentA, incidentB],
      canonicalEventId: incidentA.id,
      classification: 'SAME_PHYSICAL_REFUEL',
      asOfMs: Date.now(),
      firstSeenAtById: {
        [incidentB.id]: Date.now() - 2 * 60 * 60 * 1000,
        [incidentA.id]: Date.now(),
      },
      priorDistinctSettlement: true,
    });
    expect(settlement.finalityState).toBe('INSUFFICIENT_EVIDENCE');
    expect(settlement.enrichmentEligibleId).toBeNull();
  });

  it('distinct refuels remain separate in batch', () => {
    const sep = HISTORICAL_REFUEL_CALIBRATION_ROWS[4];
    const other = HISTORICAL_REFUEL_CALIBRATION_ROWS[5];
    const afterHorizon = Date.now() + DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
    const batch = reconcilePhysicalRefuelBatch([sep, other], { asOfMs: afterHorizon });
    expect(batch).toHaveLength(2);
    expect(batch.every((d) => d.finalityState === 'FINAL_DISTINCT')).toBe(true);
    expect(batch.every((d) => d.enrichmentEligibleId === d.canonicalEventId)).toBe(true);
  });

  describe('multi-sibling fail-closed grouping (G1.2b)', () => {
    const vehicleId = incidentA.vehicleId;
    const endTime = incidentA.endTime;

    function row(
      id: string,
      fuelStart: number,
      fuelEnd: number,
      startTime: string,
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
      };
    }

    const rowA = row('a-trans', 5, 28, '2026-09-04T03:40:00.000Z');
    const rowB = row('b-trans', 21, 28, '2026-09-04T03:45:00.000Z');
    const rowC = row('c-trans', 10, 25, '2026-09-04T03:42:00.000Z');

    it('A~B, B~C, A!~C — partitions into [A,B] and [C] (no transitive false merge)', () => {
      const spy = jest
        .spyOn(identityMatcher, 'classifyPhysicalRefuelSibling')
        .mockImplementation((a, b) => {
          const pair = [a.id, b.id].sort().join('|');
          if (pair === 'a-trans|b-trans' || pair === 'b-trans|c-trans') {
            return { classification: 'SAME_PHYSICAL_REFUEL', reason: 'mock_same' };
          }
          if (pair === 'a-trans|c-trans') {
            return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'mock_distinct' };
          }
          return classifyPhysicalRefuelSibling(a, b);
        });

      const groups = partitionPhysicalRefuelGroups([rowA, rowB, rowC]);
      expect(groups).toHaveLength(2);
      const ids = groups.map((g) => g.map((r) => r.id).sort().join(',')).sort();
      expect(ids).toEqual(['a-trans,b-trans', 'c-trans']);
      spy.mockRestore();
    });

    const permutations: RefuelRowForMatcher[][] = [
      [rowA, rowB, rowC],
      [rowA, rowC, rowB],
      [rowB, rowA, rowC],
      [rowB, rowC, rowA],
      [rowC, rowA, rowB],
      [rowC, rowB, rowA],
    ];

    it('all permutations resolve identically for non-transitive triple', () => {
      const spy = jest
        .spyOn(identityMatcher, 'classifyPhysicalRefuelSibling')
        .mockImplementation((a, b) => {
          const pair = [a.id, b.id].sort().join('|');
          if (pair === 'a-trans|b-trans' || pair === 'b-trans|c-trans') {
            return { classification: 'SAME_PHYSICAL_REFUEL', reason: 'mock_same' };
          }
          if (pair === 'a-trans|c-trans') {
            return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'mock_distinct' };
          }
          return classifyPhysicalRefuelSibling(a, b);
        });

      const canonical = permutations.map((perm) =>
        reconcilePhysicalRefuelBatch(perm).map((d) => ({
          siblingEventIds: d.siblingEventIds,
          classification: d.classification,
        })),
      );
      for (const result of canonical) {
        expect(result).toEqual(canonical[0]);
      }
      spy.mockRestore();
    });

    it('three true siblings merge to one FINAL_CANONICAL group', () => {
      const s1 = row('s1', 5, 28, '2026-09-04T03:40:00.000Z');
      const s2 = row('s2', 21, 28, '2026-09-04T03:45:00.000Z');
      const s3 = row('s3', 15, 28, '2026-09-04T03:46:00.000Z');
      const batch = reconcilePhysicalRefuelBatch([s1, s2, s3]);
      expect(batch).toHaveLength(1);
      expect(batch[0].classification).toBe('SAME_PHYSICAL_REFUEL');
      expect(batch[0].siblingEventIds).toHaveLength(3);
      expect(batch[0].finalityState).toBe('FINAL_CANONICAL');
    });

    it('two siblings + one unrelated fill yields two groups', () => {
      const unrelated = {
        ...HISTORICAL_REFUEL_CALIBRATION_ROWS[4],
        vehicleId,
        endTime,
      };
      const batch = reconcilePhysicalRefuelBatch([incidentA, incidentB, unrelated], {
        asOfMs: Date.now() + DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs,
      });
      expect(batch).toHaveLength(2);
      const siblingGroup = batch.find((d) => d.classification === 'SAME_PHYSICAL_REFUEL');
      expect(siblingGroup?.siblingEventIds).toHaveLength(2);
    });
  });
});
