import {
  EVALUATIONS_PERIOD_TYPES,
  type EvaluationsTimezoneContext,
} from '@synq/evaluations-periods/evaluations-period.contract';
import {
  resolveEvaluationsComparisonPeriods,
  resolveEvaluationsPeriod,
  resolveEvaluationsTimezone,
} from './evaluations-period.resolver';

function organizationTimezone(timeZone = 'Europe/Berlin'): EvaluationsTimezoneContext {
  return resolveEvaluationsTimezone({ organizationTimezone: timeZone });
}

describe('evaluations business-period authority', () => {
  describe('timezone precedence', () => {
    it('uses an authorized explicit report timezone before station and organization', () => {
      expect(
        resolveEvaluationsTimezone({
          reportTimezone: 'America/New_York',
          reportTimezoneAuthorized: true,
          stationTimezone: 'Europe/Vienna',
          hasUniqueStationScope: true,
          organizationTimezone: 'Europe/Berlin',
        }),
      ).toMatchObject({
        effectiveTimezone: 'America/New_York',
        source: 'REPORT_SCOPE',
      });
    });

    it('fails closed for an unauthorized explicit report timezone', () => {
      expect(() =>
        resolveEvaluationsTimezone({
          reportTimezone: 'UTC',
          reportTimezoneAuthorized: false,
          organizationTimezone: 'Europe/Berlin',
        }),
      ).toThrow('not authorized');
    });

    it('uses the unique station timezone before the organization timezone', () => {
      expect(
        resolveEvaluationsTimezone({
          stationTimezone: 'Europe/London',
          hasUniqueStationScope: true,
          organizationTimezone: 'Europe/Berlin',
        }),
      ).toMatchObject({
        effectiveTimezone: 'Europe/London',
        source: 'STATION',
        organizationTimezone: 'Europe/Berlin',
      });
    });

    it('uses the organization timezone when station scope is not unique', () => {
      expect(
        resolveEvaluationsTimezone({
          stationTimezone: 'Europe/London',
          hasUniqueStationScope: false,
          organizationTimezone: 'Europe/Berlin',
        }),
      ).toMatchObject({
        effectiveTimezone: 'Europe/Berlin',
        source: 'ORGANIZATION',
      });
    });

    it('uses the established platform fallback only when no scope timezone exists', () => {
      expect(resolveEvaluationsTimezone({})).toMatchObject({
        effectiveTimezone: 'Europe/Berlin',
        source: 'PLATFORM_FALLBACK',
      });
    });

    it('rejects invalid IANA timezone identifiers', () => {
      expect(() =>
        resolveEvaluationsTimezone({ organizationTimezone: 'Not/A_Real_Zone' }),
      ).toThrow('Invalid IANA timezone');
    });
  });

  describe('calendar and DST boundaries', () => {
    it('resolves a Berlin month boundary as UTC with an exclusive end', () => {
      const period = resolveEvaluationsPeriod({
        periodType: 'MONTH',
        reference: new Date('2026-06-16T10:00:00.000Z'),
        timezone: organizationTimezone(),
      });

      expect(period.start).toBe('2026-05-31T22:00:00.000Z');
      expect(period.endExclusive).toBe('2026-06-30T22:00:00.000Z');
      expect(period.timezone.effectiveTimezone).toBe('Europe/Berlin');
    });

    it('resolves year boundaries independently of the server timezone', () => {
      const period = resolveEvaluationsPeriod({
        periodType: 'YEAR',
        reference: new Date('2026-08-10T12:00:00.000Z'),
        timezone: organizationTimezone(),
      });

      expect(period.start).toBe('2025-12-31T23:00:00.000Z');
      expect(period.endExclusive).toBe('2026-12-31T23:00:00.000Z');
    });

    it('includes leap day in a leap-year February', () => {
      const period = resolveEvaluationsPeriod({
        periodType: 'MONTH',
        reference: new Date('2024-02-15T12:00:00.000Z'),
        timezone: organizationTimezone('UTC'),
      });

      expect(period.start).toBe('2024-02-01T00:00:00.000Z');
      expect(period.endExclusive).toBe('2024-03-01T00:00:00.000Z');
      expect(
        (Date.parse(period.endExclusive) - Date.parse(period.start)) / (24 * 60 * 60 * 1_000),
      ).toBe(29);
    });

    it('resolves the Europe/Berlin spring-forward day as 23 elapsed hours', () => {
      const period = resolveEvaluationsPeriod({
        periodType: 'DAY',
        reference: new Date('2026-03-29T10:00:00.000Z'),
        timezone: organizationTimezone(),
      });

      expect(period.start).toBe('2026-03-28T23:00:00.000Z');
      expect(period.endExclusive).toBe('2026-03-29T22:00:00.000Z');
      expect(Date.parse(period.endExclusive) - Date.parse(period.start)).toBe(23 * 60 * 60 * 1_000);
    });

    it('resolves the Europe/Berlin fall-back day as 25 elapsed hours', () => {
      const period = resolveEvaluationsPeriod({
        periodType: 'DAY',
        reference: new Date('2026-10-25T10:00:00.000Z'),
        timezone: organizationTimezone(),
      });

      expect(period.start).toBe('2026-10-24T22:00:00.000Z');
      expect(period.endExclusive).toBe('2026-10-25T23:00:00.000Z');
      expect(Date.parse(period.endExclusive) - Date.parse(period.start)).toBe(25 * 60 * 60 * 1_000);
    });

    it('keeps rolling windows as explicit elapsed durations ending at asOf', () => {
      const reference = new Date('2026-03-30T12:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        periodType: 'ROLLING_7_DAYS',
        reference,
        timezone: organizationTimezone(),
      });

      expect(Date.parse(period.endExclusive) - Date.parse(period.start)).toBe(
        7 * 24 * 60 * 60 * 1_000,
      );
      expect(period.endExclusive).toBe('2026-03-30T12:00:00.001Z');
    });
  });

  describe('comparison semantics', () => {
    it('compares MTD with the previous comparable partial month, not the full month', () => {
      const pair = resolveEvaluationsComparisonPeriods({
        periodType: 'MTD',
        comparisonType: 'PREVIOUS_COMPARABLE_PERIOD',
        reference: new Date('2026-03-16T10:30:00.000Z'),
        timezone: organizationTimezone(),
      });

      expect(pair.currentPeriod.start).toBe('2026-02-28T23:00:00.000Z');
      expect(pair.comparisonPeriod.periodType).toBe('MTD');
      expect(pair.comparisonPeriod.start).toBe('2026-01-31T23:00:00.000Z');
      expect(pair.comparisonPeriod.endExclusive).toBe('2026-02-16T10:30:00.001Z');
    });

    it('uses the complete prior month for PREVIOUS_FULL_PERIOD', () => {
      const pair = resolveEvaluationsComparisonPeriods({
        periodType: 'MTD',
        comparisonType: 'PREVIOUS_FULL_PERIOD',
        reference: new Date('2026-03-16T10:30:00.000Z'),
        timezone: organizationTimezone(),
      });

      expect(pair.comparisonPeriod.periodType).toBe('MONTH');
      expect(pair.comparisonPeriod.start).toBe('2026-01-31T23:00:00.000Z');
      expect(pair.comparisonPeriod.endExclusive).toBe('2026-02-28T23:00:00.000Z');
    });

    it('resolves year-over-year with leap-day clipping', () => {
      const pair = resolveEvaluationsComparisonPeriods({
        periodType: 'MTD',
        comparisonType: 'YEAR_OVER_YEAR',
        reference: new Date('2024-02-29T12:00:00.000Z'),
        timezone: organizationTimezone('UTC'),
      });

      expect(pair.comparisonPeriod.start).toBe('2023-02-01T00:00:00.000Z');
      expect(pair.comparisonPeriod.endExclusive).toBe('2023-02-28T12:00:00.001Z');
    });
  });

  it.each(EVALUATIONS_PERIOD_TYPES)('maintains start < end for %s', (periodType) => {
    const period = resolveEvaluationsPeriod({
      periodType,
      reference: new Date('2026-08-10T12:00:00.000Z'),
      timezone: organizationTimezone(),
    });
    expect(Date.parse(period.start)).toBeLessThan(Date.parse(period.endExclusive));
  });
});
