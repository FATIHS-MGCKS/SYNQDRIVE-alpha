import {
  reconcilePhysicalRefuelBatch,
  simulateArrivalOrder,
  buildPhysicalRefuelScopeKey,
  G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY,
} from './physical-refuel-reconciliation.design';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';

describe('physical refuel reconciliation design (G1.2 arrival-order)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];

  it('defines G2 transaction boundary with enrichment after commit', () => {
    expect(G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases[0]).toBe('BEGIN');
    expect(G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases).toContain(
      'enqueue_station_enrichment(canonical_only)',
    );
    const commitIdx = G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases.indexOf('COMMIT');
    const enrichIdx = G2_PHYSICAL_REFUEL_TRANSACTION_BOUNDARY.phases.indexOf(
      'enqueue_station_enrichment(canonical_only)',
    );
    expect(enrichIdx).toBeGreaterThan(commitIdx);
  });

  it('scope key is deterministic for same terminal state', () => {
    const k1 = buildPhysicalRefuelScopeKey(incidentA);
    const k2 = buildPhysicalRefuelScopeKey(incidentB);
    expect(k1).toBe(k2);
    expect(k1).toContain(incidentA.vehicleId);
  });

  it('arrival order A then B yields one canonical group', () => {
    const final = simulateArrivalOrder([incidentA, incidentB], [incidentA, incidentB]);
    expect(final).toHaveLength(1);
    expect(final[0].classification).toBe('SAME_PHYSICAL_REFUEL');
    expect(final[0].canonicalEventId).toBe(incidentA.id);
    expect(final[0].enrichmentEligibleId).toBe(incidentA.id);
    expect(final[0].siblingEventIds).toEqual([incidentA.id, incidentB.id].sort());
  });

  it('arrival order B then A yields identical canonical outcome', () => {
    const orderAFirst = simulateArrivalOrder([incidentA, incidentB], [incidentA, incidentB]);
    const orderBFirst = simulateArrivalOrder([incidentA, incidentB], [incidentB, incidentA]);
    expect(orderBFirst).toEqual(orderAFirst);
  });

  it('same-batch reconciliation is arrival-order independent', () => {
    const batch = reconcilePhysicalRefuelBatch([incidentA, incidentB]);
    expect(batch).toHaveLength(1);
    expect(batch[0].canonicalEventId).toBe(incidentA.id);
    expect(batch[0].enrichmentEligibleId).toBe(incidentA.id);
  });

  it('distinct refuels remain separate in batch', () => {
    const sep = HISTORICAL_REFUEL_CALIBRATION_ROWS[4];
    const other = HISTORICAL_REFUEL_CALIBRATION_ROWS[5];
    const batch = reconcilePhysicalRefuelBatch([sep, other]);
    expect(batch).toHaveLength(2);
    expect(batch.every((d) => d.enrichmentEligibleId === d.canonicalEventId)).toBe(true);
  });
});
