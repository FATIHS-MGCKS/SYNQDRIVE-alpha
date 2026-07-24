import { describe, expect, it } from 'vitest';
import {
  buildRecommendationImpactMeasurement,
  canMeasureRecommendationImpact,
  computeVarianceFromExpected,
  validateComparableImpactPeriods,
} from './evaluations-impact-measurement';

const baselinePeriod = { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' };
const measurementPeriod = { from: '2026-07-01T00:00:00.000Z', to: '2026-07-30T23:59:59.999Z' };

describe('evaluations-impact-measurement', () => {
  it('allows impact measurement for implemented statuses', () => {
    expect(canMeasureRecommendationImpact('IMPLEMENTED')).toBe(true);
    expect(canMeasureRecommendationImpact('MEASURING_IMPACT')).toBe(true);
    expect(canMeasureRecommendationImpact('NEW')).toBe(false);
  });

  it('requires comparable period lengths', () => {
    const result = validateComparableImpactPeriods(baselinePeriod, measurementPeriod);
    expect(result.comparable).toBe(true);

    const uneven = validateComparableImpactPeriods(baselinePeriod, {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-10T23:59:59.999Z',
    });
    expect(uneven.comparable).toBe(false);
    expect(uneven.limitations.some((l) => l.code === 'UNEQUAL_PERIOD_LENGTH')).toBe(true);
  });

  it('does not claim success with insufficient data', () => {
    const result = buildRecommendationImpactMeasurement({
      baselineKpiKey: 'fleetUtilization.utilizationPercent',
      baselineValue: 45,
      targetValue: 60,
      actualKpiValue: 58,
      expectedBenefit: { amountMinor: 20_000, currency: 'EUR' },
      expectedCost: { amountMinor: 5_000, currency: 'EUR' },
      actualBenefit: { amountMinor: 18_000, currency: 'EUR' },
      baselinePeriod,
      measurementPeriod,
      dataCoveragePercent: 30,
      implementationStatus: 'FULL',
      kpiDirection: 'HIGHER_IS_BETTER',
    });
    expect(result.outcomeStatus).toBe('INSUFFICIENT_DATA');
    expect(result.confidence).toBe('LOW');
    expect(result.correlationDisclaimer).toContain('Korrelation');
  });

  it('marks cancelled and partial implementations correctly', () => {
    const cancelled = buildRecommendationImpactMeasurement({
      baselineKpiKey: 'downtime.downtimePercent',
      baselineValue: 10,
      targetValue: 5,
      actualKpiValue: 8,
      baselinePeriod,
      measurementPeriod,
      dataCoveragePercent: 90,
      implementationStatus: 'CANCELLED',
      kpiDirection: 'LOWER_IS_BETTER',
    });
    expect(cancelled.outcomeStatus).toBe('CANCELLED');

    const partial = buildRecommendationImpactMeasurement({
      baselineKpiKey: 'downtime.downtimePercent',
      baselineValue: 10,
      targetValue: 5,
      actualKpiValue: 6,
      baselinePeriod,
      measurementPeriod,
      dataCoveragePercent: 90,
      implementationStatus: 'PARTIAL',
      kpiDirection: 'LOWER_IS_BETTER',
    });
    expect(partial.outcomeStatus).toBe('PARTIALLY_IMPLEMENTED');
  });

  it('computes variance from expected benefit', () => {
    expect(
      computeVarianceFromExpected(
        { amountMinor: 15_000, currency: 'EUR' },
        { amountMinor: 20_000, currency: 'EUR' },
      )?.amountMinor,
    ).toBe(-5_000);
  });

  it('reports success when KPI and benefit improve with adequate data', () => {
    const result = buildRecommendationImpactMeasurement({
      baselineKpiKey: 'fleetUtilization.utilizationPercent',
      baselineValue: 45,
      targetValue: 55,
      actualKpiValue: 57,
      expectedBenefit: { amountMinor: 20_000, currency: 'EUR' },
      actualBenefit: { amountMinor: 22_000, currency: 'EUR' },
      baselinePeriod,
      measurementPeriod,
      dataCoveragePercent: 92,
      implementationStatus: 'FULL',
      kpiDirection: 'HIGHER_IS_BETTER',
    });
    expect(result.outcomeStatus).toBe('SUCCESS');
    expect(result.trend).toBe('IMPROVING');
    expect(result.varianceFromExpected?.amountMinor).toBe(2_000);
  });
});
