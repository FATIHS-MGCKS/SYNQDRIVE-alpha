import {
  intersectVehicleIdSets,
  parseFiltersFromSearchParams,
  resolvePeriodBounds,
  resolveVehicleScopeConstraint,
  serializeFiltersToSearchParams,
  validateEvaluationsAnalyticsFilters,
} from './evaluations-analytics-filters';
import { matchesStationInsightFilter } from './insights-analytics';
import type { InsightAnalyticsRow } from './insights-analytics.contract';

describe('evaluations-analytics-filters (shared)', () => {
  it('rejects unsupported bookingChannel filter', () => {
    const errors = validateEvaluationsAnalyticsFilters({ bookingChannel: 'WEBSITE' });
    expect(errors.some((e) => e.code === 'UNSUPPORTED_BOOKING_CHANNEL')).toBe(true);
  });

  it('rejects custom period without bounds', () => {
    const errors = validateEvaluationsAnalyticsFilters({ period: 'custom' });
    expect(errors.some((e) => e.code === 'CUSTOM_PERIOD_BOUNDS_REQUIRED')).toBe(true);
  });

  it('rejects oversized custom range', () => {
    const errors = validateEvaluationsAnalyticsFilters({
      period: 'custom',
      from: '2024-01-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });
    expect(errors.some((e) => e.code === 'PERIOD_TOO_LARGE')).toBe(true);
  });

  it('serializes and parses filters for URL sharing without PII', () => {
    const params = serializeFiltersToSearchParams({
      period: 'last7d',
      stationId: '11111111-1111-4111-8111-111111111111',
      vehicleStatus: 'AVAILABLE',
      riskCategory: 'BUSINESS_RISK',
    });
    const parsed = parseFiltersFromSearchParams(params);
    expect(parsed.period).toBe('last7d');
    expect(parsed.vehicleStatus).toBe('AVAILABLE');
    expect(JSON.stringify(parsed)).not.toMatch(/email/i);
  });

  it('resolvePeriodBounds respects timezone for MTD', () => {
    const ref = new Date('2026-06-16T12:00:00.000Z');
    const { current } = resolvePeriodBounds({ period: 'mtd' }, 'Europe/Berlin', ref);
    expect(current.timezone).toBe('Europe/Berlin');
    expect(new Date(current.from).getUTCMonth()).toBe(5);
  });

  it('intersectVehicleIdSets returns empty intersection', () => {
    const a = new Set(['v1', 'v2']);
    const b = new Set(['v3']);
    expect(intersectVehicleIdSets(a, b)?.size).toBe(0);
  });

  it('resolveVehicleScopeConstraint treats empty scoped set as empty results', () => {
    const constraint = resolveVehicleScopeConstraint({
      organizationId: 'org-1',
      period: { key: 'mtd', from: '2026-01-01', to: '2026-01-31', timezone: 'UTC' },
      comparisonPeriod: { key: 'mtd', from: '2025-12-01', to: '2025-12-31', timezone: 'UTC' },
      stationId: null,
      vehicleId: null,
      vehicleClassId: null,
      vehicleStatus: null,
      bookingStatus: null,
      customerSegment: null,
      currency: 'EUR',
      riskCategory: null,
      insightStatus: null,
      dataQualityStatus: null,
      scopedVehicleIds: new Set(),
      stationVehicleIds: null,
      allowedStationIds: null,
    });
    expect(constraint).toEqual({ mode: 'empty' });
  });

  it('blocks org-wide insights for explicit station filter without station ties', () => {
    const insight: InsightAnalyticsRow = {
      id: 'insight-1',
      type: 'LOW_UTILIZATION',
      severity: 'WARNING',
      priority: 50,
      entityScope: 'ORG',
      entityIds: [],
    };
    const stationVehicles = new Set(['veh-1']);
    expect(
      matchesStationInsightFilter(insight, 'station-a', stationVehicles, null),
    ).toBe(false);
  });

  it('allows station shortage insights tied to the filtered station', () => {
    const insight: InsightAnalyticsRow = {
      id: 'insight-2',
      type: 'STATION_SHORTAGE',
      severity: 'CRITICAL',
      priority: 90,
      entityScope: 'STATION',
      entityIds: ['station-a'],
    };
    const stationVehicles = new Set(['veh-1']);
    expect(
      matchesStationInsightFilter(insight, 'station-a', stationVehicles, null),
    ).toBe(true);
  });

  it('applies implicit allowedStationIds when no explicit station filter is set', () => {
    const insight: InsightAnalyticsRow = {
      id: 'insight-3',
      type: 'STATION_SHORTAGE',
      severity: 'WARNING',
      priority: 70,
      entityScope: 'STATION',
      entityIds: ['station-b'],
    };
    expect(
      matchesStationInsightFilter(insight, null, new Set(['veh-9']), ['station-a']),
    ).toBe(false);
    expect(
      matchesStationInsightFilter(insight, null, new Set(['veh-9']), ['station-b']),
    ).toBe(true);
  });
});
