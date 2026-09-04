import {
  determinePhysicalRefuelSettlement,
  DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG,
} from './physical-refuel-settlement.design';
import { HISTORICAL_REFUEL_CALIBRATION_ROWS } from './physical-refuel-identity.matcher';

describe('physical refuel settlement design (G1.2b)', () => {
  const incidentA = HISTORICAL_REFUEL_CALIBRATION_ROWS[0];
  const incidentB = HISTORICAL_REFUEL_CALIBRATION_ROWS[1];

  it('singleton within horizon is PROVISIONAL with no enrichment eligibility', () => {
    const firstSeen = 1_000_000;
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA],
      canonicalEventId: incidentA.id,
      classification: 'DISTINCT_PHYSICAL_REFUEL',
      asOfMs: firstSeen + 30 * 60 * 1000,
      firstSeenAtById: { [incidentA.id]: firstSeen },
    });
    expect(result.finalityState).toBe('PROVISIONAL');
    expect(result.enrichmentEligibleId).toBeNull();
  });

  it('singleton after horizon is FINAL_DISTINCT', () => {
    const firstSeen = 1_000_000;
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA],
      canonicalEventId: incidentA.id,
      classification: 'DISTINCT_PHYSICAL_REFUEL',
      asOfMs:
        firstSeen + DEFAULT_PHYSICAL_REFUEL_SETTLEMENT_CONFIG.settlementHorizonMs + 1,
      firstSeenAtById: { [incidentA.id]: firstSeen },
    });
    expect(result.finalityState).toBe('FINAL_DISTINCT');
    expect(result.enrichmentEligibleId).toBe(incidentA.id);
  });

  it('resolved sibling group is FINAL_CANONICAL with canonical enrichment only', () => {
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA, incidentB],
      canonicalEventId: incidentA.id,
      classification: 'SAME_PHYSICAL_REFUEL',
      asOfMs: Date.now(),
      firstSeenAtById: {
        [incidentA.id]: Date.now() - 1000,
        [incidentB.id]: Date.now(),
      },
    });
    expect(result.finalityState).toBe('FINAL_CANONICAL');
    expect(result.enrichmentEligibleId).toBe(incidentA.id);
  });

  it('INSUFFICIENT_EVIDENCE classification yields no enrichment', () => {
    const result = determinePhysicalRefuelSettlement({
      group: [incidentA],
      canonicalEventId: null,
      classification: 'INSUFFICIENT_EVIDENCE',
      asOfMs: Date.now(),
      firstSeenAtById: { [incidentA.id]: Date.now() },
    });
    expect(result.finalityState).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.enrichmentEligibleId).toBeNull();
  });
});
