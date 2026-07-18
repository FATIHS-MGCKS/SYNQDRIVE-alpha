import {
  normalizeStationBookingRuleOutcome,
  normalizeStationCapacityStatus,
  normalizeStationHttpRoute,
  normalizeStationMetricsOutcome,
} from './station-metrics.labels';

describe('station-metrics.labels', () => {
  it('normalizes command outcomes', () => {
    expect(normalizeStationMetricsOutcome('APPLIED')).toBe('applied');
    expect(normalizeStationMetricsOutcome('IDEMPOTENT')).toBe('idempotent');
    expect(normalizeStationMetricsOutcome('BLOCKED')).toBe('blocked');
  });

  it('normalizes booking rule outcomes', () => {
    expect(normalizeStationBookingRuleOutcome('ALLOWED_WITH_INFO')).toBe('allowed');
    expect(normalizeStationBookingRuleOutcome('MANUAL_CONFIRMATION_REQUIRED')).toBe(
      'manual_confirmation',
    );
    expect(normalizeStationBookingRuleOutcome('BLOCKED')).toBe('blocked');
  });

  it('normalizes capacity status and http routes without ids', () => {
    expect(normalizeStationCapacityStatus('PROJECTED_OVER_CAPACITY')).toBe(
      'projected_over_capacity',
    );
    expect(
      normalizeStationHttpRoute(
        '/api/v1/organizations/org-1/stations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/summary',
      ),
    ).toBe('/api/v1/organizations/:orgId/stations/:id/summary');
  });
});
