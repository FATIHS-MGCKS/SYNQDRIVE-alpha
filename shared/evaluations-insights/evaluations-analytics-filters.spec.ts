import {
  intersectVehicleIdSets,
  parseFiltersFromSearchParams,
  resolvePeriodBounds,
  serializeFiltersToSearchParams,
  validateEvaluationsAnalyticsFilters,
} from './evaluations-analytics-filters';

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
});
