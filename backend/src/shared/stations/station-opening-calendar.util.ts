import { StationCalendarExceptionType } from '@prisma/client';
import { zonedDateOnly } from '@modules/pricing/tariff-instant.util';
import {
  STATION_OPENING_HOURS_WEEKDAYS,
  StationOpeningHoursDaySchedule,
  StationOpeningHoursTimeSlot,
  StationOpeningHoursWeekday,
} from './station-opening-hours.contract';
import {
  expandSlotToMinuteIntervals,
  stationOpeningHoursIsMissing,
} from './station-opening-hours.validation';
import { calendarExceptionAppliesOnDate } from './station-calendar-exception.validation';
import {
  defaultPriorityForCalendarExceptionType,
  isClosureCalendarExceptionType,
} from './station-calendar-exception.contract';
import { StationOperationalCalendarExceptionInput } from './station-operational-capability.contract';
import { parseLegacyHolidayRules } from './station-holiday-rules.legacy';

const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_SEARCH_DAYS = 21;

export type EffectiveDaySchedule =
  | { kind: 'closed'; ruleId: string; source: string; description: string }
  | { kind: 'open24h'; ruleId: string; source: string; description: string }
  | {
      kind: 'slots';
      slots: StationOpeningHoursTimeSlot[];
      ruleId: string;
      source: string;
      description: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function extractDaySlots(day: StationOpeningHoursDaySchedule): StationOpeningHoursTimeSlot[] {
  if ('closed' in day && day.closed === true) return [];
  if ('open24h' in day && day.open24h === true) {
    return [{ open: '00:00', close: '23:59' }];
  }
  if ('slots' in day && Array.isArray(day.slots)) return day.slots;
  if ('open' in day && 'close' in day) return [{ open: day.open, close: day.close }];
  return [];
}

export function zonedWeekday(instant: Date, timeZone: string): StationOpeningHoursWeekday {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  })
    .format(instant)
    .toLowerCase();
  if ((STATION_OPENING_HOURS_WEEKDAYS as readonly string[]).includes(weekday)) {
    return weekday as StationOpeningHoursWeekday;
  }
  return 'monday';
}

export function zonedTimeOfDayMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function zonedLocalTimeToUtc(
  dateOnly: string,
  time: string,
  timeZone: string,
): Date | null {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const localAt = (ms: number) => {
    const parts = formatter.formatToParts(new Date(ms));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour: Number(get('hour')),
      minute: Number(get('minute')),
      second: Number(get('second')),
    };
  };

  const lo = Date.UTC(year, month - 2, day, hour - 2, minute, 0);
  const hi = Date.UTC(year, month, day + 1, hour + 2, minute, 59);
  let fallback: Date | null = null;

  for (let ms = lo; ms <= hi; ms += 60_000) {
    const local = localAt(ms);
    if (local.year !== year || local.month !== month || local.day !== day) continue;
    if (local.hour !== hour || local.minute !== minute) continue;
    if (local.second === 0) return new Date(ms);
    if (!fallback) fallback = new Date(ms);
  }

  return fallback;
}

function getBaseWeekdaySchedule(
  openingHours: unknown,
  weekday: StationOpeningHoursWeekday,
): EffectiveDaySchedule {
  if (stationOpeningHoursIsMissing(openingHours)) {
    return {
      kind: 'closed',
      ruleId: 'opening_hours.missing',
      source: 'station.opening_hours',
      description: 'Opening hours are not configured',
    };
  }

  if (typeof openingHours === 'string') {
    return {
      kind: 'closed',
      ruleId: 'opening_hours.legacy_text',
      source: 'station.opening_hours',
      description: 'Legacy text opening hours cannot be evaluated structurally',
    };
  }

  if (!isRecord(openingHours)) {
    return {
      kind: 'closed',
      ruleId: 'opening_hours.invalid',
      source: 'station.opening_hours',
      description: 'Opening hours payload is invalid',
    };
  }

  if (typeof openingHours.legacyText === 'string' && openingHours.legacyText.trim()) {
    return {
      kind: 'closed',
      ruleId: 'opening_hours.legacy_text',
      source: 'station.opening_hours',
      description: 'Legacy text opening hours cannot be evaluated structurally',
    };
  }

  const day = openingHours[weekday] as StationOpeningHoursDaySchedule | undefined;
  if (!day) {
    return {
      kind: 'closed',
      ruleId: `opening_hours.${weekday}.missing`,
      source: 'station.opening_hours',
      description: `No schedule configured for ${weekday}`,
    };
  }

  if ('closed' in day && day.closed === true) {
    return {
      kind: 'closed',
      ruleId: `opening_hours.${weekday}.closed`,
      source: 'station.opening_hours',
      description: `${weekday} is configured as closed`,
    };
  }

  if ('open24h' in day && day.open24h === true) {
    return {
      kind: 'open24h',
      ruleId: `opening_hours.${weekday}.open24h`,
      source: 'station.opening_hours',
      description: `${weekday} is configured as 24h`,
    };
  }

  const slots = extractDaySlots(day);
  if (!slots.length) {
    return {
      kind: 'closed',
      ruleId: `opening_hours.${weekday}.empty`,
      source: 'station.opening_hours',
      description: `${weekday} has no opening slots`,
    };
  }

  return {
    kind: 'slots',
    slots,
    ruleId: `opening_hours.${weekday}`,
    source: 'station.opening_hours',
    description: `${weekday} standard opening hours`,
  };
}

function exceptionPriority(
  exception: StationOperationalCalendarExceptionInput,
): number {
  return exception.priority ?? defaultPriorityForCalendarExceptionType(exception.type);
}

function collectCalendarExceptionsForDate(
  dateOnly: string,
  calendarExceptions: StationOperationalCalendarExceptionInput[],
  legacyHolidayRules: unknown,
  stationId = 'station',
): StationOperationalCalendarExceptionInput[] {
  const items = [...calendarExceptions];
  if (legacyHolidayRules != null) {
    for (const legacy of parseLegacyHolidayRules(legacyHolidayRules, stationId)) {
      items.push({
        id: legacy.legacyImportKey,
        type: legacy.type,
        title: legacy.title,
        recurrenceKind: legacy.recurrenceKind,
        calendarDate: legacy.calendarDate,
        monthDay: legacy.monthDay,
        closedAllDay: legacy.closedAllDay,
        slots: legacy.slots,
        regionCode: legacy.regionCode,
        priority: 0,
        source: 'LEGACY_HOLIDAY_RULES',
      });
    }
  }

  return items
    .filter((item) =>
      calendarExceptionAppliesOnDate(
        {
          recurrenceKind: item.recurrenceKind ?? 'NONE',
          calendarDate: item.calendarDate ?? null,
          monthDay: item.monthDay ?? null,
        },
        dateOnly,
      ),
    )
    .sort((left, right) => exceptionPriority(right) - exceptionPriority(left));
}

function scheduleFromException(
  exception: StationOperationalCalendarExceptionInput,
): EffectiveDaySchedule | null {
  const ruleId = exception.id ?? `calendar_exception:${exception.type}`;
  const description = exception.title ?? exception.type;

  if (exception.type === StationCalendarExceptionType.SPECIAL_OPENING) {
    if (!exception.slots?.length) return null;
    return {
      kind: 'slots',
      slots: exception.slots,
      ruleId,
      source: 'station.calendar_exception',
      description: `Special opening: ${description}`,
    };
  }

  if (exception.type === StationCalendarExceptionType.MODIFIED_HOURS) {
    if (!exception.slots?.length) return null;
    return {
      kind: 'slots',
      slots: exception.slots,
      ruleId,
      source: 'station.calendar_exception',
      description: `Modified hours: ${description}`,
    };
  }

  if (isClosureCalendarExceptionType(exception.type)) {
    return {
      kind: 'closed',
      ruleId,
      source: 'station.calendar_exception',
      description: `Closure: ${description}`,
    };
  }

  if (exception.type === StationCalendarExceptionType.OPERATIONAL_EXCEPTION) {
    if (exception.closedAllDay) {
      return {
        kind: 'closed',
        ruleId,
        source: 'station.calendar_exception',
        description: `Operational exception (closed): ${description}`,
      };
    }
    if (exception.slots?.length) {
      return {
        kind: 'slots',
        slots: exception.slots,
        ruleId,
        source: 'station.calendar_exception',
        description: `Operational exception (modified): ${description}`,
      };
    }
  }

  return null;
}

export function resolveEffectiveDaySchedule(
  openingHours: unknown,
  dateOnly: string,
  weekday: StationOpeningHoursWeekday,
  options: {
    calendarExceptions?: StationOperationalCalendarExceptionInput[];
    legacyHolidayRules?: unknown;
    stationId?: string;
  } = {},
): EffectiveDaySchedule {
  const exceptions = collectCalendarExceptionsForDate(
    dateOnly,
    options.calendarExceptions ?? [],
    options.legacyHolidayRules,
    options.stationId,
  );

  const specialOpening = exceptions.find(
    (item) => item.type === StationCalendarExceptionType.SPECIAL_OPENING,
  );
  if (specialOpening) {
    const schedule = scheduleFromException(specialOpening);
    if (schedule) return schedule;
  }

  for (const exception of exceptions) {
    if (exception.type === StationCalendarExceptionType.SPECIAL_OPENING) continue;
    if (isClosureCalendarExceptionType(exception.type)) {
      return {
        kind: 'closed',
        ruleId: exception.id ?? `calendar_exception:${exception.type}`,
        source:
          exception.source === 'LEGACY_HOLIDAY_RULES'
            ? 'station.legacy_holiday_rules'
            : 'station.calendar_exception',
        description: `Closure: ${exception.title ?? exception.type}`,
      };
    }
  }

  for (const exception of exceptions) {
    if (
      exception.type === StationCalendarExceptionType.MODIFIED_HOURS ||
      exception.type === StationCalendarExceptionType.OPERATIONAL_EXCEPTION
    ) {
      const schedule = scheduleFromException(exception);
      if (schedule) return schedule;
    }
  }

  return getBaseWeekdaySchedule(openingHours, weekday);
}

function isMinuteWithinSlots(minute: number, slots: StationOpeningHoursTimeSlot[]): boolean {
  for (const slot of slots) {
    const intervals = expandSlotToMinuteIntervals(slot);
    if (!intervals) continue;
    for (const [start, end] of intervals) {
      if (minute >= start && minute < end) return true;
    }
  }
  return false;
}

export function isInstantWithinEffectiveSchedule(
  instant: Date,
  schedule: EffectiveDaySchedule,
  timeZone: string,
): boolean {
  if (schedule.kind === 'closed') return false;
  if (schedule.kind === 'open24h') return true;
  const minute = zonedTimeOfDayMinutes(instant, timeZone);
  return isMinuteWithinSlots(minute, schedule.slots);
}

function isMinuteWithinMidnightCarryOver(
  minute: number,
  slots: StationOpeningHoursTimeSlot[],
): boolean {
  for (const slot of slots) {
    const openMinutes = parseSlotOpenMinutes(slot);
    const closeMinutes = parseSlotCloseMinutes(slot);
    if (openMinutes == null || closeMinutes == null) continue;
    if (closeMinutes > openMinutes) continue;
    if (minute < closeMinutes) return true;
  }
  return false;
}

function parseSlotOpenMinutes(slot: StationOpeningHoursTimeSlot): number | null {
  const [hour, minute] = slot.open.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

export function isStationOpenAt(
  instant: Date,
  timeZone: string,
  openingHours: unknown,
  options: {
    calendarExceptions?: StationOperationalCalendarExceptionInput[];
    legacyHolidayRules?: unknown;
    stationId?: string;
  } = {},
): { open: boolean; schedule: EffectiveDaySchedule; dateOnly: string } {
  const dateOnly = zonedDateOnly(instant, timeZone);
  const weekday = zonedWeekday(instant, timeZone);
  const schedule = resolveEffectiveDaySchedule(openingHours, dateOnly, weekday, options);
  if (isInstantWithinEffectiveSchedule(instant, schedule, timeZone)) {
    return { open: true, schedule, dateOnly };
  }

  const previousDateOnly = addDaysToDateOnly(dateOnly, -1, timeZone);
  const previousWeekday = zonedWeekday(
    zonedLocalTimeToUtc(previousDateOnly, '12:00', timeZone) ?? instant,
    timeZone,
  );
  const previousSchedule = resolveEffectiveDaySchedule(
    openingHours,
    previousDateOnly,
    previousWeekday,
    options,
  );
  if (previousSchedule.kind === 'slots') {
    const minute = zonedTimeOfDayMinutes(instant, timeZone);
    if (isMinuteWithinMidnightCarryOver(minute, previousSchedule.slots)) {
      return { open: true, schedule: previousSchedule, dateOnly };
    }
  }

  return {
    open: false,
    schedule,
    dateOnly,
  };
}

export interface ResolvedOpeningWindow {
  opensAt: Date;
  closesAt: Date;
  ruleId: string;
  source: string;
  description: string;
}

function addDaysToDateOnly(dateOnly: string, days: number, timeZone: string): string {
  const anchor = zonedLocalTimeToUtc(dateOnly, '12:00', timeZone);
  if (!anchor) return dateOnly;
  return zonedDateOnly(new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000), timeZone);
}

function slotWindowForDate(
  dateOnly: string,
  slot: StationOpeningHoursTimeSlot,
  timeZone: string,
): ResolvedOpeningWindow | null {
  const openAt = zonedLocalTimeToUtc(dateOnly, slot.open, timeZone);
  if (!openAt) return null;

  const openMinutes = zonedTimeOfDayMinutes(openAt, timeZone);
  const closeMinutes = parseSlotCloseMinutes(slot);
  if (closeMinutes == null) return null;

  let closeDateOnly = dateOnly;
  if (closeMinutes <= openMinutes) {
    closeDateOnly = addDaysToDateOnly(dateOnly, 1, timeZone);
  }

  const closeTime = minutesToTime(closeMinutes === MINUTES_PER_DAY ? MINUTES_PER_DAY - 1 : closeMinutes);
  const closeAt = zonedLocalTimeToUtc(closeDateOnly, closeTime, timeZone);
  if (!closeAt) return null;

  return {
    opensAt: openAt,
    closesAt: closeAt,
    ruleId: `slot:${dateOnly}:${slot.open}-${slot.close}`,
    source: 'station.opening_hours',
    description: `Opening window ${slot.open}–${slot.close}`,
  };
}

function parseSlotCloseMinutes(slot: StationOpeningHoursTimeSlot): number | null {
  const [hour, minute] = slot.close.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (slot.close === '23:59') return MINUTES_PER_DAY;
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, totalMinutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function windowsForSchedule(
  schedule: EffectiveDaySchedule,
  dateOnly: string,
  timeZone: string,
): ResolvedOpeningWindow[] {
  if (schedule.kind === 'closed') return [];
  if (schedule.kind === 'open24h') {
    const opensAt = zonedLocalTimeToUtc(dateOnly, '00:00', timeZone);
    const closesAt = zonedLocalTimeToUtc(dateOnly, '23:59', timeZone);
    if (!opensAt || !closesAt) return [];
    return [
      {
        opensAt,
        closesAt,
        ruleId: schedule.ruleId,
        source: schedule.source,
        description: schedule.description,
      },
    ];
  }

  return schedule.slots
    .map((slot) => slotWindowForDate(dateOnly, slot, timeZone))
    .filter((window): window is ResolvedOpeningWindow => window != null)
    .map((window) => ({
      ...window,
      ruleId: schedule.ruleId,
      source: schedule.source,
      description: schedule.description,
    }));
}

export function findNextOpeningWindow(
  from: Date,
  timeZone: string,
  openingHours: unknown,
  options: {
    calendarExceptions?: StationOperationalCalendarExceptionInput[];
    legacyHolidayRules?: unknown;
    stationId?: string;
    searchDays?: number;
  } = {},
): ResolvedOpeningWindow | null {
  const searchDays = options.searchDays ?? DEFAULT_SEARCH_DAYS;
  let dateOnly = zonedDateOnly(from, timeZone);

  for (let dayOffset = 0; dayOffset <= searchDays; dayOffset += 1) {
    const currentDate = dayOffset === 0 ? dateOnly : addDaysToDateOnly(dateOnly, dayOffset, timeZone);
    const weekday = zonedWeekday(
      zonedLocalTimeToUtc(currentDate, '12:00', timeZone) ?? from,
      timeZone,
    );
    const schedule = resolveEffectiveDaySchedule(openingHours, currentDate, weekday, options);
    const windows = windowsForSchedule(schedule, currentDate, timeZone).sort(
      (left, right) => left.opensAt.getTime() - right.opensAt.getTime(),
    );

    for (const window of windows) {
      if (window.closesAt.getTime() <= from.getTime()) continue;
      if (window.opensAt.getTime() <= from.getTime() && window.closesAt.getTime() > from.getTime()) {
        return window;
      }
      if (window.opensAt.getTime() > from.getTime()) {
        return window;
      }
    }
  }

  return null;
}
