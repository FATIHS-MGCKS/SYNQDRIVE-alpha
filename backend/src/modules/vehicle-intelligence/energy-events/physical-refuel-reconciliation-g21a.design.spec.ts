import { reconcilePhysicalRefuelBatch } from './physical-refuel-reconciliation.design';
import { DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG } from './physical-refuel-settlement.design';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';

describe('physical refuel reconciliation design — G2.1a matrix/history scope', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;
  const tNow = Date.parse('2026-09-04T12:00:00.000Z');

  it('does not throw when prior FINAL is outside candidate matrix but unrelated', () => {
    const newRow = {
      ...incidentB,
      id: 'new-distinct-refuel',
      startTime: '2026-09-04T11:55:00.000Z',
      endTime: '2026-09-04T12:05:00.000Z',
      fuelStartLiters: 10,
      fuelEndLiters: 28,
    };

    const batch = reconcilePhysicalRefuelBatch([newRow], {
      asOfMs: tNow + horizon + 1,
      firstObservedAtById: { [newRow.id]: tNow },
      priorDistinctFinalizationIds: new Set([incidentA.id]),
      priorFinalRowsById: {},
      settlementConfig: { settlementHorizonMs: horizon },
    });

    expect(batch[0]?.finalityState).toBe('FINAL_DISTINCT');
    expect(batch[0]?.reasonCodes).not.toContain('late_sibling_after_finalization');
  });

  it('blocks late sibling when prior final row is provided in bridge context', () => {
    const lateSibling = {
      ...incidentB,
      id: 'late-sibling-refuel',
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
    expect(batch[0]?.reasonCodes).toContain('late_sibling_after_finalization');
  });
});
