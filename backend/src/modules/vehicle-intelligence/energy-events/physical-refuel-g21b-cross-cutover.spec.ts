import { buildRefuelCandidateWhere } from './physical-refuel-candidate.loader';
import { classifyRefuelOwnership } from './physical-refuel-prior-ownership.util';
import { reconcilePhysicalRefuelBatch } from './physical-refuel-reconciliation.design';
import { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG } from './physical-refuel-settlement.design';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';

describe('G2.1b cross-cutover ownership', () => {
  const cutover = new Date('2026-09-04T12:00:00.000Z');
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const tNow = Date.parse('2026-09-04T13:00:00.000Z');

  it('C1 restricts V2 candidate query to post-cutover observations', () => {
    const where = buildRefuelCandidateWhere(
      incidentA.vehicleId,
      {
        from: new Date('2026-09-04T06:00:00.000Z'),
        to: new Date('2026-09-04T14:00:00.000Z'),
      },
      cutover,
    );
    expect(where.createdAt).toEqual({
      gte: cutover,
      lte: new Date('2026-09-04T14:00:00.000Z'),
    });
  });

  it('C1 blocks V2 late SAME sibling against legacy enriched prior', () => {
    const lateSibling = {
      ...incidentB,
      id: 'v2-late-sibling',
      startTime: incidentA.startTime,
      endTime: incidentA.endTime,
    };

    const batch = reconcilePhysicalRefuelBatch([lateSibling], {
      asOfMs: tNow + horizon + 1,
      firstObservedAtById: { [lateSibling.id]: tNow },
      priorDistinctFinalizationIds: new Set([incidentA.id]),
      priorFinalRowsById: { [incidentA.id]: incidentA },
      settlementConfig: { settlementHorizonMs: horizon },
    });

    expect(batch[0]?.finalityState).toBe('INSUFFICIENT_EVIDENCE');
    expect(batch[0]?.enrichmentEligibleId).toBeNull();
    expect(batch[0]?.reasonCodes).toContain('late_sibling_after_finalization');
  });

  it('C3 allows unrelated post-cutover refuel to reach FINAL_DISTINCT', () => {
    const distinct = {
      ...incidentB,
      id: 'v2-distinct',
      startTime: '2026-09-04T12:55:00.000Z',
      endTime: '2026-09-04T13:05:00.000Z',
      fuelStartLiters: 10,
      fuelEndLiters: 28,
    };

    const batch = reconcilePhysicalRefuelBatch([distinct], {
      asOfMs: tNow + horizon + 1,
      firstObservedAtById: { [distinct.id]: tNow },
      priorDistinctFinalizationIds: new Set([incidentA.id]),
      priorFinalRowsById: { [incidentA.id]: incidentA },
      settlementConfig: { settlementHorizonMs: horizon },
    });

    expect(batch[0]?.finalityState).toBe('FINAL_DISTINCT');
    expect(batch[0]?.enrichmentEligibleId).toBe(distinct.id);
  });

  it('C4 classifies legacy rows as LEGACY_OWNED and V2 rows as V2_OWNED', () => {
    expect(
      classifyRefuelOwnership({ createdAt: new Date('2026-09-04T11:00:00.000Z'), kind: 'REFUEL' }, cutover),
    ).toBe('LEGACY_OWNED');
    expect(
      classifyRefuelOwnership({ createdAt: new Date('2026-09-04T12:10:00.000Z'), kind: 'REFUEL' }, cutover),
    ).toBe('V2_OWNED');
  });
});
