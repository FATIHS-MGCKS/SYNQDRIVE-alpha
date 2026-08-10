import type {
  EvaluationsComparisonPeriodPair,
  EvaluationsComparisonType,
  EvaluationsPeriodType,
  EvaluationsPeriodWindow,
  EvaluationsTimezoneContext,
} from '@synq/evaluations-periods/evaluations-period.contract';
import { assertValidEvaluationsTimezoneContext } from '@synq/evaluations-periods/evaluations-period.validator';
import {
  DEFAULT_PLATFORM_TIMEZONE,
  assertIanaTimezone,
  formatDateOnly,
  parseDateOnly,
  zonedDateOnly,
  zonedDateTimeParts,
  zonedDateTimeToUtc,
  zonedStartOfDayToUtc,
} from '@shared/time/iana-timezone.util';

const DAY_MS = 24 * 60 * 60 * 1_000;
type EvaluationsCalendarPeriodType = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

export interface ResolveEvaluationsTimezoneInput {
  readonly reportTimezone?: string | null;
  readonly reportTimezoneAuthorized?: boolean;
  readonly stationTimezone?: string | null;
  readonly hasUniqueStationScope?: boolean;
  readonly organizationTimezone?: string | null;
}

export interface ResolveEvaluationsPeriodInput {
  readonly periodType: EvaluationsPeriodType;
  readonly reference: Date;
  readonly timezone: EvaluationsTimezoneContext;
  readonly comparisonBasis?: EvaluationsComparisonType | null;
}

function normalizedTimezone(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  assertIanaTimezone(normalized);
  return normalized;
}

function validatedTimezoneContext(
  context: EvaluationsTimezoneContext,
): EvaluationsTimezoneContext {
  assertValidEvaluationsTimezoneContext(context);
  return context;
}

/**
 * Business timezone precedence is report scope → unique station → organization
 * → the existing platform fallback. Authorization is resolved by the caller;
 * an unauthorized report override fails closed.
 */
export function resolveEvaluationsTimezone(
  input: ResolveEvaluationsTimezoneInput,
): EvaluationsTimezoneContext {
  const reportTimezone = normalizedTimezone(input.reportTimezone);
  const stationTimezone = normalizedTimezone(input.stationTimezone);
  const organizationTimezone = normalizedTimezone(input.organizationTimezone);

  if (reportTimezone && input.reportTimezoneAuthorized !== true) {
    throw new Error('Explicit evaluations report timezone is not authorized');
  }

  if (reportTimezone) {
    return validatedTimezoneContext({
      effectiveTimezone: reportTimezone,
      source: 'REPORT_SCOPE',
      reportTimezone,
      stationTimezone,
      organizationTimezone,
    });
  }

  if (input.hasUniqueStationScope === true && stationTimezone) {
    return validatedTimezoneContext({
      effectiveTimezone: stationTimezone,
      source: 'STATION',
      reportTimezone: null,
      stationTimezone,
      organizationTimezone,
    });
  }

  if (organizationTimezone) {
    return validatedTimezoneContext({
      effectiveTimezone: organizationTimezone,
      source: 'ORGANIZATION',
      reportTimezone: null,
      stationTimezone,
      organizationTimezone,
    });
  }

  return validatedTimezoneContext({
    effectiveTimezone: DEFAULT_PLATFORM_TIMEZONE,
    source: 'PLATFORM_FALLBACK',
    reportTimezone: null,
    stationTimezone,
    organizationTimezone: null,
  });
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarDays(dateOnly: string, count: number): string {
  const date = parseDateOnly(dateOnly);
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + count));
  return formatDateOnly(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

function addCalendarMonths(
  year: number,
  month: number,
  count: number,
): { readonly year: number; readonly month: number } {
  const total = year * 12 + month - 1 + count;
  return {
    year: Math.floor(total / 12),
    month: ((total % 12) + 12) % 12 + 1,
  };
}

function isoWeekStart(dateOnly: string): string {
  const date = parseDateOnly(dateOnly);
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return addCalendarDays(dateOnly, weekday === 0 ? -6 : 1 - weekday);
}

function quarterStartMonth(month: number): number {
  return Math.floor((month - 1) / 3) * 3 + 1;
}

function rollingDays(periodType: EvaluationsPeriodType): number | null {
  const match = /^ROLLING_(\d+)_DAYS$/.exec(periodType);
  return match ? Number(match[1]) : null;
}

function isCalendarPeriodType(
  periodType: EvaluationsPeriodType,
): periodType is EvaluationsCalendarPeriodType {
  return (
    periodType === 'DAY' ||
    periodType === 'WEEK' ||
    periodType === 'MONTH' ||
    periodType === 'QUARTER' ||
    periodType === 'YEAR'
  );
}

function calendarBounds(
  periodType: EvaluationsCalendarPeriodType,
  referenceDateOnly: string,
  timeZone: string,
): { readonly start: Date; readonly endExclusive: Date } {
  const { year, month } = parseDateOnly(referenceDateOnly);
  let startDateOnly: string;
  let endDateOnly: string;

  switch (periodType) {
    case 'DAY':
      startDateOnly = referenceDateOnly;
      endDateOnly = addCalendarDays(referenceDateOnly, 1);
      break;
    case 'WEEK':
      startDateOnly = isoWeekStart(referenceDateOnly);
      endDateOnly = addCalendarDays(startDateOnly, 7);
      break;
    case 'MONTH': {
      startDateOnly = formatDateOnly(year, month, 1);
      const next = addCalendarMonths(year, month, 1);
      endDateOnly = formatDateOnly(next.year, next.month, 1);
      break;
    }
    case 'QUARTER': {
      const startMonth = quarterStartMonth(month);
      startDateOnly = formatDateOnly(year, startMonth, 1);
      const next = addCalendarMonths(year, startMonth, 3);
      endDateOnly = formatDateOnly(next.year, next.month, 1);
      break;
    }
    case 'YEAR':
      startDateOnly = formatDateOnly(year, 1, 1);
      endDateOnly = formatDateOnly(year + 1, 1, 1);
      break;
    default: {
      const exhaustive: never = periodType;
      throw new Error(`Unsupported calendar period: ${exhaustive}`);
    }
  }

  return {
    start: zonedStartOfDayToUtc(startDateOnly, timeZone),
    endExclusive: zonedStartOfDayToUtc(endDateOnly, timeZone),
  };
}

function assertValidReference(reference: Date): void {
  if (Number.isNaN(reference.getTime())) {
    throw new Error('Evaluations period reference must be a valid UTC instant');
  }
}

export function resolveEvaluationsPeriod(
  input: ResolveEvaluationsPeriodInput,
): EvaluationsPeriodWindow {
  assertValidReference(input.reference);
  assertValidEvaluationsTimezoneContext(input.timezone);
  const timeZone = input.timezone.effectiveTimezone;
  assertIanaTimezone(timeZone);
  const referenceDateOnly = zonedDateOnly(input.reference, timeZone);
  const { year, month } = parseDateOnly(referenceDateOnly);
  const rolling = rollingDays(input.periodType);

  let start: Date;
  let endExclusive: Date;

  if (rolling !== null) {
    endExclusive = new Date(input.reference.getTime() + 1);
    start = new Date(endExclusive.getTime() - rolling * DAY_MS);
  } else if (input.periodType === 'MTD') {
    start = zonedStartOfDayToUtc(formatDateOnly(year, month, 1), timeZone);
    endExclusive = new Date(input.reference.getTime() + 1);
  } else if (input.periodType === 'QTD') {
    start = zonedStartOfDayToUtc(
      formatDateOnly(year, quarterStartMonth(month), 1),
      timeZone,
    );
    endExclusive = new Date(input.reference.getTime() + 1);
  } else if (input.periodType === 'YTD') {
    start = zonedStartOfDayToUtc(formatDateOnly(year, 1, 1), timeZone);
    endExclusive = new Date(input.reference.getTime() + 1);
  } else {
    if (!isCalendarPeriodType(input.periodType)) {
      throw new Error(`Unsupported evaluations period: ${input.periodType}`);
    }
    const bounds = calendarBounds(input.periodType, referenceDateOnly, timeZone);
    start = bounds.start;
    endExclusive = bounds.endExclusive;
  }

  if (start.getTime() >= endExclusive.getTime()) {
    throw new Error(
      `Invalid evaluations period: ${start.toISOString()} must be before ${endExclusive.toISOString()}`,
    );
  }

  return {
    periodType: input.periodType,
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
    reference: input.reference.toISOString(),
    timezone: input.timezone,
    comparisonBasis: input.comparisonBasis ?? null,
  };
}

function shiftReference(
  reference: Date,
  timeZone: string,
  shift: { readonly days?: number; readonly months?: number; readonly years?: number },
): Date {
  const local = zonedDateTimeParts(reference, timeZone);
  let year = local.year - (shift.years ?? 0);
  let month = local.month;

  if (shift.months) {
    const shifted = addCalendarMonths(year, month, shift.months);
    year = shifted.year;
    month = shifted.month;
  }

  let dateOnly = formatDateOnly(
    year,
    month,
    Math.min(local.day, daysInMonth(year, month)),
  );
  if (shift.days) {
    dateOnly = addCalendarDays(dateOnly, shift.days);
  }
  const date = parseDateOnly(dateOnly);

  return zonedDateTimeToUtc(
    {
      ...date,
      hour: local.hour,
      minute: local.minute,
      second: local.second,
      millisecond: local.millisecond,
    },
    timeZone,
    'COMPATIBLE',
  );
}

function previousPeriodShift(
  periodType: EvaluationsPeriodType,
): { readonly days?: number; readonly months?: number; readonly years?: number } {
  const rolling = rollingDays(periodType);
  if (rolling !== null) return { days: -rolling };

  switch (periodType) {
    case 'DAY':
      return { days: -1 };
    case 'WEEK':
      return { days: -7 };
    case 'MONTH':
    case 'MTD':
      return { months: -1 };
    case 'QUARTER':
    case 'QTD':
      return { months: -3 };
    case 'YEAR':
    case 'YTD':
      return { years: 1 };
    default:
      throw new Error(`Unsupported comparison period: ${periodType}`);
  }
}

function fullPeriodType(periodType: EvaluationsPeriodType): EvaluationsPeriodType {
  if (periodType === 'MTD') return 'MONTH';
  if (periodType === 'QTD') return 'QUARTER';
  if (periodType === 'YTD') return 'YEAR';
  return periodType;
}

export function resolveEvaluationsComparisonPeriods(input: {
  readonly periodType: EvaluationsPeriodType;
  readonly comparisonType: EvaluationsComparisonType;
  readonly reference: Date;
  readonly timezone: EvaluationsTimezoneContext;
}): EvaluationsComparisonPeriodPair {
  const currentPeriod = resolveEvaluationsPeriod({
    periodType: input.periodType,
    reference: input.reference,
    timezone: input.timezone,
    comparisonBasis: input.comparisonType,
  });

  if (input.comparisonType === 'TARGET') {
    return {
      comparisonType: input.comparisonType,
      currentPeriod,
      comparisonPeriod: { ...currentPeriod, comparisonBasis: 'TARGET' },
    };
  }

  const timeZone = input.timezone.effectiveTimezone;
  const rolling = rollingDays(input.periodType);
  const shiftedReference =
    input.comparisonType === 'YEAR_OVER_YEAR'
      ? shiftReference(input.reference, timeZone, { years: 1 })
      : rolling !== null
        ? new Date(input.reference.getTime() - rolling * DAY_MS)
      : shiftReference(input.reference, timeZone, previousPeriodShift(input.periodType));
  const comparisonPeriodType =
    input.comparisonType === 'PREVIOUS_FULL_PERIOD'
      ? fullPeriodType(input.periodType)
      : input.periodType;

  return {
    comparisonType: input.comparisonType,
    currentPeriod,
    comparisonPeriod: resolveEvaluationsPeriod({
      periodType: comparisonPeriodType,
      reference: shiftedReference,
      timezone: input.timezone,
      comparisonBasis: input.comparisonType,
    }),
  };
}
