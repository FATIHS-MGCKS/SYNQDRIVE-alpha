import { describe, expect, it } from 'vitest';
import {
  buildEvaluationsForecastsSection,
  computeConfidenceLevel,
  isForecastStale,
  isRegistryApproved,
  mapOperationalForecastCard,
  resolveVisibility,
  type OperationalForecastRow,
  type RegistryRow,
} from './evaluations-forecast-view-model';

function operational(overrides: Partial<OperationalForecastRow> = {}): OperationalForecastRow {
  return {
    id: 'f1',
    forecastKey: 'DEMAND',
    horizonDays: 30,
    modelVersion: 'demand-baseline-v1.0',
    featureSetVersion: 'feature-store-v1',
    inferenceTier: 'STATISTICAL',
    scopeKey: 'fleet',
    currency: 'EUR',
    unit: 'count',
    asOfDate: '2026-02-04',
    horizonStartDate: '2026-02-05',
    horizonEndDate: '2026-03-06',
    pointEstimate: 120,
    intervalLow: 90,
    intervalHigh: 150,
    dataCoveragePercent: 92,
    status: 'AVAILABLE',
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    evaluation: { smape: 18 },
    explainability: { topFactors: [{ factor: 'history', impact: '90 days' }] },
    ...overrides,
  };
}

const approvedRegistry: RegistryRow[] = [
  {
    modelKey: 'DEMAND',
    modelVersion: 'demand-baseline-v1.0',
    horizonDays: 30,
    status: 'APPROVED',
    gatesPassed: true,
  },
];

describe('evaluations-forecast-view-model', () => {
  it('shows available forecast when registry approved and data sufficient', () => {
    const card = mapOperationalForecastCard(operational(), approvedRegistry, []);
    expect(card.visibility).toBe('available');
    expect(card.pointEstimate).toBe(120);
    expect(card.intervalLow).toBe(90);
  });

  it('hides forecast when release gate not passed', () => {
    const card = mapOperationalForecastCard(
      operational(),
      [{ ...approvedRegistry[0], status: 'DRAFT' }],
      [],
    );
    expect(card.visibility).toBe('gate_not_passed');
    expect(card.pointEstimate).toBeNull();
  });

  it('flags low confidence for fallback tier', () => {
    const card = mapOperationalForecastCard(
      operational({ status: 'FALLBACK', dataCoveragePercent: 75 }),
      approvedRegistry,
      [],
    );
    expect(card.confidenceLevel).toBe('low');
    expect(['low_confidence', 'partial_data']).toContain(card.visibility);
  });

  it('suppresses insufficient history', () => {
    const resolved = resolveVisibility({
      registry: approvedRegistry[0],
      forecastStatus: 'INSUFFICIENT_HISTORY',
      dataCoveragePercent: 20,
      isStale: false,
      suppressedReason: 'Need 30 days',
    });
    expect(resolved.displayable).toBe(false);
    expect(resolved.visibility).toBe('insufficient_history');
  });

  it('detects stale forecasts', () => {
    const stale = isForecastStale(
      new Date(Date.now() - 100 * 3600000).toISOString(),
      null,
    );
    expect(stale).toBe(true);
  });

  it('blocks disabled models', () => {
    const resolved = resolveVisibility({
      registry: { ...approvedRegistry[0], status: 'DISABLED' },
      forecastStatus: 'AVAILABLE',
      dataCoveragePercent: 90,
      isStale: false,
    });
    expect(resolved.visibility).toBe('model_disabled');
  });

  it('builds section with displayable cards only', () => {
    const section = buildEvaluationsForecastsSection({
      operational: [
        operational(),
        operational({ id: 'f2', forecastKey: 'REVENUE', horizonDays: 7 }),
      ],
      risk: [],
      registry: approvedRegistry,
      backtests: [],
    });
    expect(section.displayableCards.length).toBe(1);
    expect(section.hiddenCount).toBe(1);
  });

  it('computes confidence levels', () => {
    expect(computeConfidenceLevel(95, 'STATISTICAL', 'AVAILABLE')).toBe('high');
    expect(computeConfidenceLevel(50, 'RULE_BASED', 'AVAILABLE')).toBe('low');
  });

  it('requires APPROVED registry for production display', () => {
    expect(isRegistryApproved('APPROVED')).toBe(true);
    expect(isRegistryApproved('SHADOW')).toBe(false);
  });
});
