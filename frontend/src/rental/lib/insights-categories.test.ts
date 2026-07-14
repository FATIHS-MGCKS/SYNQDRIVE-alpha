import { describe, expect, it } from 'vitest';
import type { DashboardInsight } from '../DashboardInsightsContext';
import {
  financialImpactEur,
  matchesStationIdFilter,
  partitionInsights,
  resolveInsightCategory,
} from './insights-categories';

function insight(overrides: Partial<DashboardInsight> = {}): DashboardInsight {
  return {
    id: overrides.id ?? 'ins-1',
    type: overrides.type ?? 'TIGHT_HANDOVER',
    severity: overrides.severity ?? 'WARNING',
    priority: overrides.priority ?? 50,
    title: overrides.title ?? 'Test',
    message: overrides.message ?? 'Message',
    entityScope: overrides.entityScope ?? 'VEHICLE',
    entityIds: overrides.entityIds ?? ['v1'],
    timeContext: overrides.timeContext ?? null,
    metrics: overrides.metrics ?? null,
    reasons: overrides.reasons ?? null,
    isGrouped: false,
    groupCount: 1,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveInsightCategory', () => {
  it('respects metrics.category for all known categories', () => {
    expect(resolveInsightCategory(insight({ metrics: { category: 'FINANCIAL' } }))).toBe('FINANCIAL');
    expect(resolveInsightCategory(insight({ metrics: { category: 'MISUSE_ABUSE' } }))).toBe('MISUSE_ABUSE');
    expect(resolveInsightCategory(insight({ metrics: { category: 'OPERATIONAL_RECOMMENDATION' } }))).toBe(
      'OPERATIONAL_RECOMMENDATION',
    );
    expect(resolveInsightCategory(insight({ metrics: { category: 'BUSINESS_RISK' } }))).toBe('BUSINESS_RISK');
    expect(resolveInsightCategory(insight({ metrics: { category: 'REVENUE_LEAKAGE' } }))).toBe('REVENUE_LEAKAGE');
  });

  it('falls back to type mapping only when category is missing or unknown', () => {
    expect(resolveInsightCategory(insight({ type: 'LOW_UTILIZATION', metrics: {} }))).toBe('REVENUE_LEAKAGE');
    expect(resolveInsightCategory(insight({ type: 'STATION_SHORTAGE', metrics: {} }))).toBe('BUSINESS_RISK');
    expect(resolveInsightCategory(insight({ type: 'HM_SERVICE_NO_TRACKING', metrics: {} }))).toBe(
      'OPERATIONAL_RECOMMENDATION',
    );
    expect(
      resolveInsightCategory(
        insight({ type: 'HM_SERVICE_NO_TRACKING', metrics: { category: 'UNKNOWN' } }),
      ),
    ).toBe('OPERATIONAL_RECOMMENDATION');
  });
});

describe('financialImpactEur', () => {
  it('converts financialImpactCents from cents to euros', () => {
    expect(financialImpactEur(insight({ metrics: { financialImpactCents: 14_900 } }))).toBe(149);
    expect(financialImpactEur(insight({ metrics: { financialImpactCents: 50_000 } }))).toBe(500);
  });

  it('uses lostRevenueEur as euros without dividing by 100', () => {
    expect(financialImpactEur(insight({ metrics: { lostRevenueEur: 1_500 } }))).toBe(1_500);
    expect(financialImpactEur(insight({ metrics: { lostRevenueEur: 42 } }))).toBe(42);
  });

  it('prefers financialImpactCents when both fields are present', () => {
    expect(
      financialImpactEur(
        insight({
          metrics: { financialImpactCents: 10_000, lostRevenueEur: 999 },
        }),
      ),
    ).toBe(100);
  });
});

describe('matchesStationIdFilter', () => {
  const vehiclesAtStation = new Set(['v1', 'v2']);

  it('passes through when no station filter is active', () => {
    expect(matchesStationIdFilter(insight(), null, vehiclesAtStation)).toBe(true);
  });

  it('matches station-scoped insights by station entity id', () => {
    expect(
      matchesStationIdFilter(
        insight({ entityScope: 'STATION', entityIds: ['st-1'] }),
        'st-1',
        vehiclesAtStation,
      ),
    ).toBe(true);
    expect(
      matchesStationIdFilter(
        insight({ entityScope: 'STATION', entityIds: ['st-2'] }),
        'st-1',
        vehiclesAtStation,
      ),
    ).toBe(false);
  });

  it('matches vehicle insights only when vehicle belongs to the station', () => {
    expect(matchesStationIdFilter(insight({ entityIds: ['v1'] }), 'st-1', vehiclesAtStation)).toBe(true);
    expect(matchesStationIdFilter(insight({ entityIds: ['v9'] }), 'st-1', vehiclesAtStation)).toBe(false);
  });

  it('excludes unknown vehicle mappings when station filter is active', () => {
    expect(
      matchesStationIdFilter(
        insight({ entityIds: ['booking-1'], metrics: { bookingId: 'booking-1' } }),
        'st-1',
        vehiclesAtStation,
      ),
    ).toBe(false);
  });

  it('allows fleet-wide insights under station filter', () => {
    expect(
      matchesStationIdFilter(
        insight({ entityScope: 'FLEET', entityIds: [] }),
        'st-1',
        vehiclesAtStation,
      ),
    ).toBe(true);
  });

  it('matches booking context station ids when vehicle mapping is unavailable', () => {
    expect(
      matchesStationIdFilter(
        insight({
          entityScope: 'VEHICLE',
          entityIds: ['booking-1'],
          timeContext: { pickupStationId: 'st-1' },
        }),
        'st-1',
        vehiclesAtStation,
      ),
    ).toBe(true);
  });
});

describe('partitionInsights', () => {
  it('routes categories into the correct buckets', () => {
    const rows = [
      insight({ id: 'br', metrics: { category: 'BUSINESS_RISK' }, severity: 'WARNING' }),
      insight({ id: 'rl', metrics: { category: 'REVENUE_LEAKAGE' }, severity: 'WARNING' }),
      insight({ id: 'fin', metrics: { category: 'FINANCIAL' }, severity: 'INFO' }),
      insight({ id: 'mis', metrics: { category: 'MISUSE_ABUSE' }, severity: 'CRITICAL' }),
      insight({ id: 'op', metrics: { category: 'OPERATIONAL_RECOMMENDATION' }, severity: 'INFO' }),
    ];

    const { businessRisks, revenueLeakage, recommended } = partitionInsights(rows);

    expect(businessRisks.map((i) => i.id)).toEqual(['br']);
    expect(revenueLeakage.map((i) => i.id)).toEqual(['rl', 'fin']);
    expect(recommended.map((i) => i.id).sort()).toEqual(['br', 'op', 'rl'].sort());
  });
});
