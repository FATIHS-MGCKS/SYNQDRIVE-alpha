import { BillingInterval } from '@prisma/client';
import { zonedDateOnly, zonedStartOfDayToUtc } from '@modules/pricing/tariff-instant.util';

export const BillingPeriodErrorCode = {
  INVALID_ANCHOR_DAY: 'INVALID_ANCHOR_DAY',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
} as const;

export type BillingPeriodSource = 'SUBSCRIPTION' | 'ANCHOR_CALENDAR';

export interface BillingPeriodConfig {
  interval: BillingInterval;
  anchorDay: number;
  /** Calendar month (1-12) for yearly billing anchors. Defaults to January. */
  anchorMonth?: number;
  timezone: string;
}

export interface SubscriptionPeriodOverride {
  periodStart: Date;
  periodEnd: Date;
}

export interface ResolvedBillingPeriodWindow {
  periodStart: Date;
  /** Exclusive UTC instant marking the next period boundary. */
  periodEnd: Date;
  interval: BillingInterval;
  anchorDay: number;
  timezone: string;
  source: BillingPeriodSource;
}

function parseDateOnly(dateOnly: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return { year, month, day };
}

function formatDateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addCalendarMonths(year: number, month: number, count: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + count;
  return {
    year: Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

function clampAnchorDay(year: number, month: number, anchorDay: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(anchorDay, daysInMonth);
}

function periodStartDateOnlyForYearlyReference(
  referenceDateOnly: string,
  anchorMonth: number,
  anchorDay: number,
): string {
  const { year, month, day } = parseDateOnly(referenceDateOnly);
  const effectiveAnchor = clampAnchorDay(year, anchorMonth, anchorDay);
  const referenceOrdinal = month * 100 + day;
  const anchorOrdinal = anchorMonth * 100 + effectiveAnchor;

  const startYear = referenceOrdinal >= anchorOrdinal ? year : year - 1;
  const startAnchor = clampAnchorDay(startYear, anchorMonth, anchorDay);
  return formatDateOnly(startYear, anchorMonth, startAnchor);
}

function nextYearlyPeriodStartDateOnly(
  periodStartDateOnly: string,
  anchorMonth: number,
  anchorDay: number,
): string {
  const { year } = parseDateOnly(periodStartDateOnly);
  const nextYear = year + 1;
  const nextAnchor = clampAnchorDay(nextYear, anchorMonth, anchorDay);
  return formatDateOnly(nextYear, anchorMonth, nextAnchor);
}

function periodStartDateOnlyForReference(
  referenceDateOnly: string,
  anchorDay: number,
  interval: BillingInterval,
  anchorMonth: number,
): string {
  if (interval === BillingInterval.YEARLY) {
    return periodStartDateOnlyForYearlyReference(referenceDateOnly, anchorMonth, anchorDay);
  }

  const { year, month, day } = parseDateOnly(referenceDateOnly);
  const effectiveAnchor = clampAnchorDay(year, month, anchorDay);

  if (day >= effectiveAnchor) {
    return formatDateOnly(year, month, effectiveAnchor);
  }

  const previous = addCalendarMonths(year, month, -1);
  const previousAnchor = clampAnchorDay(previous.year, previous.month, anchorDay);
  return formatDateOnly(previous.year, previous.month, previousAnchor);
}

function nextPeriodStartDateOnly(
  periodStartDateOnly: string,
  interval: BillingInterval,
  anchorDay: number,
  anchorMonth: number,
): string {
  if (interval === BillingInterval.YEARLY) {
    return nextYearlyPeriodStartDateOnly(periodStartDateOnly, anchorMonth, anchorDay);
  }

  const { year, month } = parseDateOnly(periodStartDateOnly);
  const next = addCalendarMonths(year, month, 1);
  const nextAnchor = clampAnchorDay(next.year, next.month, anchorDay);
  return formatDateOnly(next.year, next.month, nextAnchor);
}

export function resolveBillingPeriodWindow(input: {
  reference: Date;
  config: BillingPeriodConfig;
  subscriptionPeriod?: SubscriptionPeriodOverride | null;
}): ResolvedBillingPeriodWindow {
  const anchorDay = input.config.anchorDay;
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 28) {
    throw new Error(BillingPeriodErrorCode.INVALID_ANCHOR_DAY);
  }

  const timezone = input.config.timezone?.trim() || 'UTC';
  const anchorMonth = input.config.anchorMonth ?? 1;

  if (input.subscriptionPeriod) {
    const { periodStart, periodEnd } = input.subscriptionPeriod;
    if (
      input.reference.getTime() >= periodStart.getTime() &&
      input.reference.getTime() < periodEnd.getTime()
    ) {
      return {
        periodStart,
        periodEnd,
        interval: input.config.interval,
        anchorDay,
        timezone,
        source: 'SUBSCRIPTION',
      };
    }
  }

  const referenceDateOnly = zonedDateOnly(input.reference, timezone);
  const startDateOnly = periodStartDateOnlyForReference(
    referenceDateOnly,
    anchorDay,
    input.config.interval,
    anchorMonth,
  );
  const endDateOnly = nextPeriodStartDateOnly(
    startDateOnly,
    input.config.interval,
    anchorDay,
    anchorMonth,
  );

  return {
    periodStart: zonedStartOfDayToUtc(startDateOnly, timezone),
    periodEnd: zonedStartOfDayToUtc(endDateOnly, timezone),
    interval: input.config.interval,
    anchorDay,
    timezone,
    source: 'ANCHOR_CALENDAR',
  };
}

export function periodLengthMs(period: Pick<ResolvedBillingPeriodWindow, 'periodStart' | 'periodEnd'>): number {
  return period.periodEnd.getTime() - period.periodStart.getTime();
}
