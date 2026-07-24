import { describe, expect, it } from 'vitest';
import {
  buildEvaluationsForecastsSection,
  mapOperationalForecastCard,
  type OperationalForecastRow,
  type RegistryRow,
} from '../../lib/evaluations-forecast-view-model';

const approved: RegistryRow = {
  modelKey: 'UTILIZATION',
  modelVersion: 'utilization-baseline-v1.0',
  horizonDays: 7,
  status: 'APPROVED',
  gatesPassed: true,
};

function row(overrides: Partial<OperationalForecastRow> = {}): OperationalForecastRow {
  return {
    id: 'u1',
    forecastKey: 'UTILIZATION',
    horizonDays: 7,
    modelVersion: 'utilization-baseline-v1.0',
    featureSetVersion: 'feature-store-v1',
    inferenceTier: 'STATISTICAL',
    scopeKey: 'fleet',
    currency: 'EUR',
    unit: 'percent',
    asOfDate: '2026-02-04',
    horizonStartDate: '2026-02-05',
    horizonEndDate: '2026-02-11',
    pointEstimate: 72.5,
    intervalLow: 65,
    intervalHigh: 80,
    dataCoveragePercent: 55,
    status: 'AVAILABLE',
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  };
}

describe('EvaluationsForecastsSection states', () => {
  it('partial data remains displayable with warning visibility', () => {
    const card = mapOperationalForecastCard(row(), [approved], []);
    expect(card.visibility).toBe('partial_data');
    expect(card.pointEstimate).toBe(72.5);
  });

  it('stale forecast is not displayable in section', () => {
    const section = buildEvaluationsForecastsSection({
      operational: [
        row({
          generatedAt: new Date(Date.now() - 200 * 3600000).toISOString(),
          expiresAt: new Date(Date.now() - 3600000).toISOString(),
        }),
      ],
      risk: [],
      registry: [approved],
      backtests: [],
    });
    expect(section.displayableCards).toHaveLength(0);
    expect(section.hiddenCount).toBe(1);
  });

  it('exposes filter context with EUR currency', () => {
    const section = buildEvaluationsForecastsSection({
      operational: [row()],
      risk: [],
      registry: [approved],
      backtests: [],
      stationLabel: 'Berlin Mitte',
    });
    expect(section.filterContext.currency).toBe('EUR');
    expect(section.filterContext.stationLabel).toBe('Berlin Mitte');
  });
});
