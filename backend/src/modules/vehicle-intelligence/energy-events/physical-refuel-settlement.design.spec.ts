import {
  determinePhysicalRefuelSettlement,
  isSettlementWindowOpen,
  DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
} from './physical-refuel-settlement.design';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';

describe('physical refuel settlement design (G1.2c)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];
  const incidentC: typeof incidentA = {
    ...incidentA,
    id: 'c-stronger-evidence',
    dimoSegmentId: 'seg-c-stronger',
    fuelStartLiters: 15,
    fuelEndLiters: 28,
    fuelDeltaLiters: 13,
    startTime: '2026-09-04T03:46:00.000Z',
  };

  const t0 = 1_700_000_000_000;
  const horizon = DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs;

  it('singleton inside horizon → PROVISIONAL, no enrichment', () => {
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA],
      canonicalEventId: incidentA.id,
      classification: 'DISTINCT_PHYSICAL_REFUEL',
      asOfMs: t0 + 20 * 60 * 1000,
      firstObservedAtById: { [incidentA.id]: t0 },
    });
    expect(result.finalityState).toBe('PROVISIONAL');
    expect(result.enrichmentEligibleId).toBeNull();
    expect(result.settlementWindowOpen).toBe(true);
  });

  it('two SAME siblings inside horizon → SETTLING, no enrichment', () => {
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA, incidentB],
      canonicalEventId: incidentA.id,
      classification: 'SAME_PHYSICAL_REFUEL',
      asOfMs: t0 + 20 * 60 * 1000,
      firstObservedAtById: { [incidentA.id]: t0, [incidentB.id]: t0 + 20 * 60 * 1000 },
    });
    expect(result.finalityState).toBe('SETTLING');
    expect(result.enrichmentEligibleId).toBeNull();
    expect(result.provisionalCanonicalId).toBe(incidentA.id);
    expect(result.reasonCodes).toContain('settlement_window_open');
  });

  it('three SAME siblings inside horizon → SETTLING, no enrichment', () => {
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA, incidentB, incidentC],
      canonicalEventId: incidentA.id,
      classification: 'SAME_PHYSICAL_REFUEL',
      asOfMs: t0 + 40 * 60 * 1000,
      firstObservedAtById: {
        [incidentA.id]: t0,
        [incidentB.id]: t0 + 20 * 60 * 1000,
        [incidentC.id]: t0 + 40 * 60 * 1000,
      },
    });
    expect(result.finalityState).toBe('SETTLING');
    expect(result.enrichmentEligibleId).toBeNull();
  });

  it('after horizon from latest observation → FINAL_CANONICAL with one enrichment', () => {
    const latestObs = t0 + 40 * 60 * 1000;
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA, incidentB, incidentC],
      canonicalEventId: incidentA.id,
      classification: 'SAME_PHYSICAL_REFUEL',
      asOfMs: latestObs + horizon + 1,
      firstObservedAtById: {
        [incidentA.id]: t0,
        [incidentB.id]: t0 + 20 * 60 * 1000,
        [incidentC.id]: latestObs,
      },
    });
    expect(result.finalityState).toBe('FINAL_CANONICAL');
    expect(result.enrichmentEligibleId).toBe(incidentA.id);
    expect(result.settlementWindowOpen).toBe(false);
  });

  it('singleton after horizon → FINAL_DISTINCT', () => {
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA],
      canonicalEventId: incidentA.id,
      classification: 'DISTINCT_PHYSICAL_REFUEL',
      asOfMs: t0 + horizon + 1,
      firstObservedAtById: { [incidentA.id]: t0 },
    });
    expect(result.finalityState).toBe('FINAL_DISTINCT');
    expect(result.enrichmentEligibleId).toBe(incidentA.id);
  });

  it('missing firstObservedAt → INSUFFICIENT_EVIDENCE (no eventTime fallback)', () => {
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA],
      canonicalEventId: incidentA.id,
      classification: 'DISTINCT_PHYSICAL_REFUEL',
      asOfMs: t0 + horizon + 1,
      firstObservedAtById: {},
    });
    expect(result.finalityState).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.reasonCodes).toContain('missing_system_observation_time');
  });

  it('old event.endTime does not consume settlement age when firstObservedAt is now', () => {
    const now = t0;
    const oldEndMs = now - 50 * 60 * 1000;
    expect(new Date(incidentA.endTime).getTime()).not.toBe(oldEndMs);

    const window = isSettlementWindowOpen(
      [incidentA],
      now + 5 * 60 * 1000,
      { [incidentA.id]: now },
    );
    expect(window.open).toBe(true);
    expect(window.missingObservation).toBe(false);

    const settlement = determinePhysicalRefuelSettlement({
      group: [incidentA],
      canonicalEventId: incidentA.id,
      classification: 'DISTINCT_PHYSICAL_REFUEL',
      asOfMs: now + 5 * 60 * 1000,
      firstObservedAtById: { [incidentA.id]: now },
    });
    expect(settlement.finalityState).toBe('PROVISIONAL');
  });

  it('late sibling after finalization → fail closed', () => {
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA, incidentB],
      canonicalEventId: incidentA.id,
      classification: 'SAME_PHYSICAL_REFUEL',
      asOfMs: t0 + horizon + 1,
      firstObservedAtById: {
        [incidentA.id]: t0,
        [incidentB.id]: t0 + horizon + 1000,
      },
      priorDistinctFinalization: true,
    });
    expect(result.finalityState).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.reasonCodes).toContain('late_sibling_after_finalization');
    expect(result.enrichmentEligibleId).toBeNull();
  });
});
