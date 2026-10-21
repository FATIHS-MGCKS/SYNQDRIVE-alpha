import { buildEnergyEventSegmentsQuery } from './energy-event-segments.query';
import { buildDimoRechargeSegmentsQuery } from '../recharge-segments/dimo-recharge-segments.query';
import { validateDimoSegmentsQuery } from './validate-dimo-segments-query';
import { DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG } from '../energy-events/dimo-energy-detector.config';

/** Regression query from commit 79e381069 — must fail schema validation. */
function buildRegression79e381069RechargeQuery(): string {
  return `
    query DimoRechargeSegments {
      segments(
        tokenId: 186946
        from: "2026-06-15T00:00:00.000Z"
        to: "2026-07-16T00:00:00.000Z"
        mechanism: recharge
        limit: 50
        after: "2026-06-18T05:05:33.000Z"
        signalRequests: [
          { name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MIN }
        ]
      ) {
        id
        start { timestamp value { latitude longitude } }
        end { timestamp value { latitude longitude } }
        duration
        isOngoing
        startedBeforeRange
        signals { name agg value }
      }
    }
  `.trim();
}

describe('validateDimoSegmentsQuery', () => {
  it('accepts the canonical refuel energy-event query', () => {
    const query = buildEnergyEventSegmentsQuery(
      187336,
      new Date('2026-08-22T00:00:00.000Z'),
      new Date('2026-08-24T00:00:00.000Z'),
      'refuel',
      DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
    );
    const result = validateDimoSegmentsQuery(query);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(query).toContain('mechanism: refuel');
    expect(query).toContain('config: { minIncreasePercent: 5 }');
    expect(query).not.toMatch(/\blimit\s*:/);
    expect(query).not.toMatch(/\bafter\s*:/);
    expect(query).not.toMatch(/\bid\b/);
  });

  it('accepts refuel query without config (default detector reference)', () => {
    const query = buildEnergyEventSegmentsQuery(
      187336,
      new Date('2026-08-22T00:00:00.000Z'),
      new Date('2026-08-24T00:00:00.000Z'),
      'refuel',
    );
    const result = validateDimoSegmentsQuery(query);
    expect(result.valid).toBe(true);
    expect(query).not.toContain('config:');
  });

  it('accepts the repaired recharge query', () => {
    const query = buildDimoRechargeSegmentsQuery({
      tokenId: 186946,
      fromIso: '2026-06-15T00:00:00.000Z',
      toIso: '2026-07-16T00:00:00.000Z',
    });
    const result = validateDimoSegmentsQuery(query);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(query).toContain('mechanism: recharge');
    expect(query).toContain('powertrainTractionBatteryChargingAddedEnergy');
    expect(query).not.toMatch(/\blimit\s*:/);
    expect(query).not.toMatch(/\bafter\s*:/);
    expect(query).not.toMatch(/\bid\b/);
    expect(query).not.toMatch(/signals\s*\{[^}]*\bagg\b/);
  });

  it('rejects the 79e381069 regression query shape', () => {
    const result = validateDimoSegmentsQuery(buildRegression79e381069RechargeQuery());
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        'forbidden segments argument: limit',
        'forbidden segments argument: after',
        'forbidden Segment selection field: id',
        'forbidden signals selection field: agg',
      ]),
    );
  });
});
