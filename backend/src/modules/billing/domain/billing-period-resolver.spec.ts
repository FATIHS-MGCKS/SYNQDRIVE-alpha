import { BillingInterval } from '@prisma/client';
import {
  periodLengthMs,
  resolveBillingPeriodWindow,
} from './billing-period-resolver';

describe('billing-period-resolver', () => {
  const monthlyUtc = {
    interval: BillingInterval.MONTHLY,
    anchorDay: 1,
    timezone: 'UTC',
  };

  it('resolves the first day of a monthly period', () => {
    const period = resolveBillingPeriodWindow({
      reference: new Date('2026-03-01T00:00:00.000Z'),
      config: monthlyUtc,
    });

    expect(period.periodStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(period.source).toBe('ANCHOR_CALENDAR');
  });

  it('resolves mid-month reference to the same period start', () => {
    const period = resolveBillingPeriodWindow({
      reference: new Date('2026-03-15T12:00:00.000Z'),
      config: monthlyUtc,
    });

    expect(period.periodStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('resolves the last day of a monthly period before the next boundary', () => {
    const period = resolveBillingPeriodWindow({
      reference: new Date('2026-03-31T23:59:59.000Z'),
      config: monthlyUtc,
    });

    expect(period.periodStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('handles month boundary crossings with a mid-month anchor', () => {
    const period = resolveBillingPeriodWindow({
      reference: new Date('2026-04-10T00:00:00.000Z'),
      config: {
        interval: BillingInterval.MONTHLY,
        anchorDay: 15,
        timezone: 'UTC',
      },
    });

    expect(period.periodStart.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('covers February in a non-leap year', () => {
    const period = resolveBillingPeriodWindow({
      reference: new Date('2025-02-20T00:00:00.000Z'),
      config: monthlyUtc,
    });

    expect(period.periodStart.toISOString()).toBe('2025-02-01T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2025-03-01T00:00:00.000Z');
    expect(periodLengthMs(period)).toBe(28 * 24 * 60 * 60 * 1000);
  });

  it('covers February in a leap year', () => {
    const period = resolveBillingPeriodWindow({
      reference: new Date('2024-02-29T00:00:00.000Z'),
      config: monthlyUtc,
    });

    expect(period.periodStart.toISOString()).toBe('2024-02-01T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(periodLengthMs(period)).toBe(29 * 24 * 60 * 60 * 1000);
  });

  it('resolves yearly contract periods from the anchor month/day', () => {
    const period = resolveBillingPeriodWindow({
      reference: new Date('2026-08-01T00:00:00.000Z'),
      config: {
        interval: BillingInterval.YEARLY,
        anchorDay: 15,
        anchorMonth: 1,
        timezone: 'UTC',
      },
    });

    expect(period.periodStart.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(period.interval).toBe(BillingInterval.YEARLY);
  });

  it('prefers subscription period boundaries when the reference is inside them', () => {
    const period = resolveBillingPeriodWindow({
      reference: new Date('2026-07-10T00:00:00.000Z'),
      config: monthlyUtc,
      subscriptionPeriod: {
        periodStart: new Date('2026-07-05T00:00:00.000Z'),
        periodEnd: new Date('2026-08-05T00:00:00.000Z'),
      },
    });

    expect(period.source).toBe('SUBSCRIPTION');
    expect(period.periodStart.toISOString()).toBe('2026-07-05T00:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });
});
