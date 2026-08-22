import {
  computeBookingDeltaPercent,
  computeUtilizationDeltaPp,
  computeWindowUtilizationPercent,
  daysInMonth,
  previousMonth,
  utilizationPercentFromRatio,
  vehicleMatchesStation,
} from './dashboard-utilization.domain';
import type { E4UtilizationVehicleFacts } from '@modules/evaluations-analytics/e4/evaluations-insights.repository';

describe('dashboard-utilization.domain', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const periodStart = Date.UTC(2026, 7, 1);
  const periodEnd = Date.UTC(2026, 8, 1);

  function vehicleFacts(rented: { startMs: number; endExclusiveMs: number }[]): E4UtilizationVehicleFacts {
    return {
      vehicleId: 'v1',
      eligibility: { startMs: periodStart, endExclusiveMs: periodEnd },
      rented,
      maintenance: [],
      blocked: [],
    };
  }

  it('computes utilization percent from ratio', () => {
    expect(utilizationPercentFromRatio(0.786)).toBe(78.6);
    expect(utilizationPercentFromRatio(null)).toBeNull();
  });

  it('computes window utilization from rented intervals', () => {
    const facts = [
      vehicleFacts([{ startMs: periodStart, endExclusiveMs: periodStart + dayMs * 20 }]),
    ];
    const pct = computeWindowUtilizationPercent(facts, periodStart, periodEnd);
    expect(pct).toBeGreaterThan(60);
    expect(pct).toBeLessThan(70);
  });

  it('returns null utilization when no net capacity', () => {
    expect(computeWindowUtilizationPercent([], periodStart, periodEnd)).toBeNull();
  });

  it('computes utilization delta in percentage points', () => {
    expect(computeUtilizationDeltaPp(78, 72)).toBe(6);
    expect(computeUtilizationDeltaPp(null, 72)).toBeNull();
  });

  it('computes booking delta percent with zero guard', () => {
    expect(computeBookingDeltaPercent(42, 38)).toBeCloseTo(10.5, 1);
    expect(computeBookingDeltaPercent(42, 0)).toBeNull();
  });

  it('resolves previous month across year boundary', () => {
    expect(previousMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
    expect(previousMonth(2026, 8)).toEqual({ year: 2026, month: 7 });
  });

  it('counts days in month', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 8)).toBe(31);
  });

  it('matches vehicle station by home or current', () => {
    expect(
      vehicleMatchesStation({ homeStationId: 'st-1', currentStationId: null }, 'st-1'),
    ).toBe(true);
    expect(
      vehicleMatchesStation({ homeStationId: null, currentStationId: 'st-2' }, 'st-2'),
    ).toBe(true);
    expect(
      vehicleMatchesStation({ homeStationId: 'st-1', currentStationId: null }, 'st-9'),
    ).toBe(false);
    expect(
      vehicleMatchesStation({ homeStationId: 'st-1', currentStationId: null }, null),
    ).toBe(true);
  });
});
