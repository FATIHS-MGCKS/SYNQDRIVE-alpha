import {
  DEFAULT_TARIFF_TIMEZONE,
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@modules/pricing/tariff-instant.util';
import type {
  EvaluationsPeriodPreset,
  EvaluationsPeriodWindow,
  EvaluationsReportingPeriodBundle,
  EvaluationsTimezoneContext,
} from '@synq/evaluations-periods/evaluations-period.contract';

export interface ResolveEvaluationsPeriodInput {
  preset: EvaluationsPeriodPreset;
  reference: Date;
  timezone: EvaluationsTimezoneContext;
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
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarDays(dateOnly: string, deltaDays: number): string {
  const { year, month, day } = parseDateOnly(dateOnly);
  const utc = Date.UTC(year, month - 1, day + deltaDays);
  const d = new Date(utc);
  return formatDateOnly(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function nextDateOnly(dateOnly: string): string {
  return addCalendarDays(dateOnly, 1);
}

function zonedEndOfDayInclusive(dateOnly: string, timeZone: string): Date {
  const nextStart = zonedStartOfDayToUtc(nextDateOnly(dateOnly), timeZone);
  return new Date(nextStart.getTime() - 1);
}

function zonedEndExclusive(dateOnly: string, timeZone: string): Date {
  return zonedStartOfDayToUtc(nextDateOnly(dateOnly), timeZone);
}

function quarterStartMonth(month: number): number {
  return Math.floor((month - 1) / 3) * 3 + 1;
}

/** ISO week — Monday as first day of week. */
function isoWeekStartDateOnly(referenceDateOnly: string): string {
  const { year, month, day } = parseDateOnly(referenceDateOnly);
  const utc = Date.UTC(year, month - 1, day);
  const dow = new Date(utc).getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addCalendarDays(referenceDateOnly, mondayOffset);
}

function buildCalendarAnchors(referenceDateOnly: string) {
  const { year, month } = parseDateOnly(referenceDateOnly);
  const monthStartDateOnly = formatDateOnly(year, month, 1);
  const monthEndDateOnly = formatDateOnly(year, month, daysInMonth(year, month));
  const qMonth = quarterStartMonth(month);
  const quarterStartDateOnly = formatDateOnly(year, qMonth, 1);
  const yearStartDateOnly = formatDateOnly(year, 1, 1);
  const weekStartDateOnly = isoWeekStartDateOnly(referenceDateOnly);

  return {
    referenceDateOnly,
    weekStartDateOnly,
    monthStartDateOnly,
    monthEndDateOnly,
    quarterStartDateOnly,
    yearStartDateOnly,
  };
}

function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

function sameWallClockShifted(
  reference: Date,
  timeZone: string,
  shift: { months?: number; years?: number },
): { periodStart: Date; periodEndInclusive: Date; startDateOnly: string; endDateOnly: string } {
  const refDateOnly = zonedDateOnly(reference, timeZone);
  const { year, month, day } = parseDateOnly(refDateOnly);
  const startOfRefDay = zonedStartOfDayToUtc(refDateOnly, timeZone);
  const msIntoDay = reference.getTime() - startOfRefDay.getTime();

  let targetYear = year;
  let targetMonth = month;
  if (shift.years) targetYear -= shift.years;
  if (shift.months) {
    const shifted = addCalendarMonths(year, month, shift.months);
    targetYear = shifted.year;
    targetMonth = shifted.month;
  }

  const targetDay = clampDayToMonth(targetYear, targetMonth, day);
  const startDateOnly = formatDateOnly(targetYear, targetMonth, 1);
  const endDateOnly = formatDateOnly(targetYear, targetMonth, targetDay);
  const periodStart = zonedStartOfDayToUtc(startDateOnly, timeZone);
  const startOfEndDay = zonedStartOfDayToUtc(endDateOnly, timeZone);
  const periodEndInclusive = new Date(startOfEndDay.getTime() + msIntoDay);

  return { periodStart, periodEndInclusive, startDateOnly, endDateOnly };
}

function samePeriodPreviousMonth(reference: Date, timeZone: string) {
  const shifted = sameWallClockShifted(reference, timeZone, { months: -1 });
  return {
    ...shifted,
    periodEndExclusive: new Date(shifted.periodEndInclusive.getTime() + 1),
  };
}

function samePeriodPreviousYear(reference: Date, timeZone: string) {
  const shifted = sameWallClockShifted(reference, timeZone, { years: 1 });
  return {
    ...shifted,
    periodEndExclusive: new Date(shifted.periodEndInclusive.getTime() + 1),
  };
}

function rollingWindow(referenceDateOnly: string, days: number, reference: Date, timeZone: string) {
  const startDateOnly = addCalendarDays(referenceDateOnly, -(days - 1));
  return {
    periodStart: zonedStartOfDayToUtc(startDateOnly, timeZone),
    periodEndInclusive: reference,
    periodEndExclusive: new Date(reference.getTime() + 1),
    startDateOnly,
    endDateOnly: referenceDateOnly,
  };
}

function toPeriodWindow(
  preset: EvaluationsPeriodPreset,
  reference: Date,
  timezone: EvaluationsTimezoneContext,
  bounds: {
    periodStart: Date;
    periodEndInclusive: Date;
    periodEndExclusive: Date;
    referenceDateOnly: string;
  },
): EvaluationsPeriodWindow {
  return {
    preset,
    reference: reference.toISOString(),
    periodStart: bounds.periodStart.toISOString(),
    periodEndInclusive: bounds.periodEndInclusive.toISOString(),
    periodEndExclusive: bounds.periodEndExclusive.toISOString(),
    timezone,
    calendar: buildCalendarAnchors(bounds.referenceDateOnly),
  };
}

export function resolveEvaluationsPeriod(input: ResolveEvaluationsPeriodInput): EvaluationsPeriodWindow {
  const timeZone = input.timezone.effective.trim() || DEFAULT_TARIFF_TIMEZONE;
  const reference = input.reference;
  const referenceDateOnly = zonedDateOnly(reference, timeZone);
  const { year, month } = parseDateOnly(referenceDateOnly);

  let periodStart: Date;
  let periodEndInclusive: Date;
  let periodEndExclusive: Date;

  switch (input.preset) {
    case 'today': {
      periodStart = zonedStartOfDayToUtc(referenceDateOnly, timeZone);
      periodEndInclusive = reference;
      periodEndExclusive = zonedEndExclusive(referenceDateOnly, timeZone);
      break;
    }
    case 'mtd': {
      const monthStartDateOnly = formatDateOnly(year, month, 1);
      periodStart = zonedStartOfDayToUtc(monthStartDateOnly, timeZone);
      periodEndInclusive = reference;
      periodEndExclusive = new Date(reference.getTime() + 1);
      break;
    }
    case 'qtd': {
      const qStart = formatDateOnly(year, quarterStartMonth(month), 1);
      periodStart = zonedStartOfDayToUtc(qStart, timeZone);
      periodEndInclusive = reference;
      periodEndExclusive = new Date(reference.getTime() + 1);
      break;
    }
    case 'ytd': {
      const yStart = formatDateOnly(year, 1, 1);
      periodStart = zonedStartOfDayToUtc(yStart, timeZone);
      periodEndInclusive = reference;
      periodEndExclusive = new Date(reference.getTime() + 1);
      break;
    }
    case 'calendar_week': {
      const weekStart = isoWeekStartDateOnly(referenceDateOnly);
      periodStart = zonedStartOfDayToUtc(weekStart, timeZone);
      periodEndInclusive = reference;
      periodEndExclusive = new Date(reference.getTime() + 1);
      break;
    }
    case 'calendar_month': {
      const monthStartDateOnly = formatDateOnly(year, month, 1);
      const monthEndDateOnly = formatDateOnly(year, month, daysInMonth(year, month));
      periodStart = zonedStartOfDayToUtc(monthStartDateOnly, timeZone);
      periodEndInclusive = zonedEndOfDayInclusive(monthEndDateOnly, timeZone);
      periodEndExclusive = zonedEndExclusive(monthEndDateOnly, timeZone);
      break;
    }
    case 'rolling_7d':
    case 'rolling_30d':
    case 'rolling_60d':
    case 'rolling_90d':
    case 'rolling_365d': {
      const days = Number(input.preset.replace('rolling_', '').replace('d', ''));
      const rolling = rollingWindow(referenceDateOnly, days, reference, timeZone);
      periodStart = rolling.periodStart;
      periodEndInclusive = rolling.periodEndInclusive;
      periodEndExclusive = rolling.periodEndExclusive;
      break;
    }
    case 'prev_month_same_period': {
      const prev = samePeriodPreviousMonth(reference, timeZone);
      periodStart = prev.periodStart;
      periodEndInclusive = prev.periodEndInclusive;
      periodEndExclusive = prev.periodEndExclusive;
      break;
    }
    case 'yoy_same_period': {
      const yoy = samePeriodPreviousYear(reference, timeZone);
      periodStart = yoy.periodStart;
      periodEndInclusive = yoy.periodEndInclusive;
      periodEndExclusive = yoy.periodEndExclusive;
      break;
    }
    default: {
      const exhaustive: never = input.preset;
      throw new Error(`Unsupported evaluations period preset: ${exhaustive}`);
    }
  }

  return toPeriodWindow(input.preset, reference, input.timezone, {
    periodStart,
    periodEndInclusive,
    periodEndExclusive,
    referenceDateOnly,
  });
}

export function resolveEvaluationsReportingPeriodBundle(input: {
  reference: Date;
  timezone: EvaluationsTimezoneContext;
}): EvaluationsReportingPeriodBundle {
  const generatedAt = new Date();
  return {
    generatedAt: generatedAt.toISOString(),
    reference: input.reference.toISOString(),
    timezone: input.timezone,
    mtd: resolveEvaluationsPeriod({ preset: 'mtd', reference: input.reference, timezone: input.timezone }),
    prevMonthSamePeriod: resolveEvaluationsPeriod({
      preset: 'prev_month_same_period',
      reference: input.reference,
      timezone: input.timezone,
    }),
    yoySamePeriod: resolveEvaluationsPeriod({
      preset: 'yoy_same_period',
      reference: input.reference,
      timezone: input.timezone,
    }),
  };
}
