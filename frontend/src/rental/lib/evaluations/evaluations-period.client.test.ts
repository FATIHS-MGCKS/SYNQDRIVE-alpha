import { describe, expect, it } from 'vitest';
import { reportingBundleToFinancialRanges, periodWindowToDateRange } from './evaluations-period.client';
import type { EvaluationsReportingPeriodBundle } from '@synq/evaluations-periods/evaluations-period.contract';

const sampleBundle: EvaluationsReportingPeriodBundle = {
  generatedAt: '2026-06-16T12:00:00.000Z',
  reference: '2026-06-16T12:00:00.000Z',
  timezone: {
    effective: 'Europe/Berlin',
    organization: 'Europe/Berlin',
    station: null,
    source: 'organization',
  },
  mtd: {
    preset: 'mtd',
    reference: '2026-06-16T12:00:00.000Z',
    periodStart: '2026-06-01T00:00:00.000Z',
    periodEndInclusive: '2026-06-16T12:00:00.000Z',
    periodEndExclusive: '2026-06-16T12:00:01.000Z',
    timezone: {
      effective: 'Europe/Berlin',
      organization: 'Europe/Berlin',
      station: null,
      source: 'organization',
    },
    calendar: {
      referenceDateOnly: '2026-06-16',
      weekStartDateOnly: '2026-06-16',
      monthStartDateOnly: '2026-06-01',
      monthEndDateOnly: '2026-06-30',
      quarterStartDateOnly: '2026-04-01',
      yearStartDateOnly: '2026-01-01',
    },
  },
  prevMonthSamePeriod: {
    preset: 'prev_month_same_period',
    reference: '2026-06-16T12:00:00.000Z',
    periodStart: '2026-05-01T00:00:00.000Z',
    periodEndInclusive: '2026-05-16T12:00:00.000Z',
    periodEndExclusive: '2026-05-16T12:00:01.000Z',
    timezone: {
      effective: 'Europe/Berlin',
      organization: 'Europe/Berlin',
      station: null,
      source: 'organization',
    },
    calendar: {
      referenceDateOnly: '2026-06-16',
      weekStartDateOnly: '2026-06-16',
      monthStartDateOnly: '2026-06-01',
      monthEndDateOnly: '2026-06-30',
      quarterStartDateOnly: '2026-04-01',
      yearStartDateOnly: '2026-01-01',
    },
  },
  yoySamePeriod: {
    preset: 'yoy_same_period',
    reference: '2026-06-16T12:00:00.000Z',
    periodStart: '2025-06-01T00:00:00.000Z',
    periodEndInclusive: '2025-06-16T12:00:00.000Z',
    periodEndExclusive: '2025-06-16T12:00:01.000Z',
    timezone: {
      effective: 'Europe/Berlin',
      organization: 'Europe/Berlin',
      station: null,
      source: 'organization',
    },
    calendar: {
      referenceDateOnly: '2026-06-16',
      weekStartDateOnly: '2026-06-16',
      monthStartDateOnly: '2026-06-01',
      monthEndDateOnly: '2026-06-30',
      quarterStartDateOnly: '2026-04-01',
      yearStartDateOnly: '2026-01-01',
    },
  },
};

describe('evaluations-period.client', () => {
  it('converts period window to Date range', () => {
    const range = periodWindowToDateRange(sampleBundle.mtd);
    expect(range.from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-06-16T12:00:00.000Z');
  });

  it('maps reporting bundle to financial ranges', () => {
    const ranges = reportingBundleToFinancialRanges(sampleBundle);
    expect(ranges.timezone).toBe('Europe/Berlin');
    expect(ranges.mtd.from.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(ranges.prevMonth.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(ranges.yoy.from.toISOString()).toBe('2025-06-01T00:00:00.000Z');
  });
});
