import {
  resolveEvaluationsPeriod,
  resolveEvaluationsReportingPeriodBundle,
} from './evaluations-period.resolver';
import type { EvaluationsTimezoneContext } from '@synq/evaluations-periods/evaluations-period.contract';

function orgTz(timeZone: string): EvaluationsTimezoneContext {
  return {
    effective: timeZone,
    organization: timeZone,
    station: null,
    source: 'organization',
  };
}

function stationTz(org: string, station: string): EvaluationsTimezoneContext {
  return {
    effective: station,
    organization: org,
    station,
    source: 'station',
  };
}

describe('evaluations-period.resolver', () => {
  describe('MTD', () => {
    it('resolves MTD in Europe/Berlin at mid-month', () => {
      const reference = new Date('2026-06-16T10:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'mtd',
        reference,
        timezone: orgTz('Europe/Berlin'),
      });

      expect(period.periodStart).toBe('2026-05-31T22:00:00.000Z');
      expect(period.periodEndInclusive).toBe(reference.toISOString());
      expect(period.calendar.monthStartDateOnly).toBe('2026-06-01');
      expect(period.timezone.effective).toBe('Europe/Berlin');
    });

    it('uses org timezone — not UTC — at month boundary near midnight Berlin', () => {
      const reference = new Date('2026-05-31T22:30:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'mtd',
        reference,
        timezone: orgTz('Europe/Berlin'),
      });

      expect(period.calendar.referenceDateOnly).toBe('2026-06-01');
      expect(period.periodStart).toBe('2026-05-31T22:00:00.000Z');
    });
  });

  describe('DST — Europe/Berlin', () => {
    it('spring forward: March 30 2026 day start remains 23:00 UTC previous day', () => {
      const reference = new Date('2026-03-30T12:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'today',
        reference,
        timezone: orgTz('Europe/Berlin'),
      });

      expect(period.periodStart).toBe('2026-03-29T22:00:00.000Z');
    });

    it('fall back: October 26 2025 day start uses CEST end offset', () => {
      const reference = new Date('2025-10-26T12:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'today',
        reference,
        timezone: orgTz('Europe/Berlin'),
      });

      expect(period.periodStart).toBe('2025-10-25T22:00:00.000Z');
    });
  });

  describe('month and year boundaries', () => {
    it('month rollover: last second of January in UTC vs Berlin MTD', () => {
      const reference = new Date('2026-01-31T23:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'mtd',
        reference,
        timezone: orgTz('Europe/Berlin'),
      });

      expect(period.calendar.referenceDateOnly).toBe('2026-02-01');
      expect(period.periodStart).toBe('2026-01-31T23:00:00.000Z');
    });

    it('year rollover MTD starts January 1 in org timezone', () => {
      const reference = new Date('2026-01-01T01:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'ytd',
        reference,
        timezone: orgTz('Europe/Berlin'),
      });

      expect(period.periodStart).toBe('2025-12-31T23:00:00.000Z');
      expect(period.calendar.yearStartDateOnly).toBe('2026-01-01');
    });
  });

  describe('leap year', () => {
    it('February 29 2024 calendar month has 29 days', () => {
      const reference = new Date('2024-02-29T12:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'calendar_month',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(period.calendar.monthEndDateOnly).toBe('2024-02-29');
      expect(period.periodEndInclusive).toBe('2024-02-29T23:59:59.999Z');
    });

    it('prev_month_same_period clamps March 31 to February 29 in leap year', () => {
      const reference = new Date('2024-03-31T15:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'prev_month_same_period',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(period.periodStart).toBe('2024-02-01T00:00:00.000Z');
      expect(period.periodEndInclusive).toBe('2024-02-29T15:00:00.000Z');
    });
  });

  describe('QTD and YTD', () => {
    it('QTD starts at quarter boundary', () => {
      const reference = new Date('2026-08-15T12:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'qtd',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(period.periodStart).toBe('2026-07-01T00:00:00.000Z');
      expect(period.calendar.quarterStartDateOnly).toBe('2026-07-01');
    });

    it('YTD starts January 1', () => {
      const reference = new Date('2026-08-15T12:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'ytd',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(period.periodStart).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('rolling windows', () => {
    it('rolling_7d includes 7 calendar days in org timezone', () => {
      const reference = new Date('2026-06-16T18:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'rolling_7d',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(period.periodStart).toBe('2026-06-10T00:00:00.000Z');
      expect(period.periodEndInclusive).toBe(reference.toISOString());
    });

    it('rolling_30d spans 30 calendar days', () => {
      const reference = new Date('2026-06-30T12:00:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'rolling_30d',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(period.periodStart).toBe('2026-06-01T00:00:00.000Z');
    });
  });

  describe('comparisons', () => {
    it('prev_month_same_period aligns day-of-month', () => {
      const reference = new Date('2026-06-16T15:30:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'prev_month_same_period',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(period.periodStart).toBe('2026-05-01T00:00:00.000Z');
      expect(period.periodEndInclusive).toBe('2026-05-16T15:30:00.000Z');
    });

    it('yoy_same_period aligns prior year', () => {
      const reference = new Date('2026-06-16T15:30:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'yoy_same_period',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(period.periodStart).toBe('2025-06-01T00:00:00.000Z');
      expect(period.periodEndInclusive).toBe('2025-06-16T15:30:00.000Z');
    });
  });

  describe('timezone contexts', () => {
    it('midnight America/New_York differs from UTC calendar day', () => {
      const reference = new Date('2026-06-16T03:30:00.000Z');
      const ny = resolveEvaluationsPeriod({
        preset: 'today',
        reference,
        timezone: orgTz('America/New_York'),
      });
      const utc = resolveEvaluationsPeriod({
        preset: 'today',
        reference,
        timezone: orgTz('UTC'),
      });

      expect(ny.calendar.referenceDateOnly).toBe('2026-06-15');
      expect(utc.calendar.referenceDateOnly).toBe('2026-06-16');
    });

    it('station timezone overrides org for period boundaries', () => {
      const reference = new Date('2026-06-16T03:30:00.000Z');
      const period = resolveEvaluationsPeriod({
        preset: 'mtd',
        reference,
        timezone: stationTz('Europe/Berlin', 'America/Los_Angeles'),
      });

      expect(period.timezone.source).toBe('station');
      expect(period.timezone.effective).toBe('America/Los_Angeles');
      expect(period.calendar.referenceDateOnly).toBe('2026-06-15');
    });
  });

  describe('reporting bundle', () => {
    it('returns MTD + comparison periods with shared timezone', () => {
      const reference = new Date('2026-06-16T12:00:00.000Z');
      const bundle = resolveEvaluationsReportingPeriodBundle({
        reference,
        timezone: orgTz('Europe/Berlin'),
      });

      expect(bundle.mtd.preset).toBe('mtd');
      expect(bundle.prevMonthSamePeriod.preset).toBe('prev_month_same_period');
      expect(bundle.yoySamePeriod.preset).toBe('yoy_same_period');
      expect(bundle.timezone.effective).toBe('Europe/Berlin');
    });
  });
});
