import {
  DEFAULT_TARIFF_TIMEZONE,
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@modules/pricing/tariff-instant.util';
import { isValidIanaTimezone } from '@modules/vehicles/diagnostic/vehicle-booking-handover-diagnostic.util';
import { StationOpeningHoursTimeSlot } from './station-opening-hours.contract';
import {
  DEFAULT_STATION_TIMEZONE,
  StationTimezoneValidationCode,
} from './station-timezone.contract';

export * from './station-timezone.contract';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;

export class StationTimezoneError extends Error {
  constructor(
    message: string,
    public readonly code: StationTimezoneValidationCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StationTimezoneError';
  }
}

export interface StationDayBoundsUtc {
  startUtc: Date;
  endUtc: Date;
  dateOnly: string;
  timezone: string;
}

export interface StationNowContext {
  instantUtc: Date;
  localDate: string;
  localTime: string;
  timezone: string;
}

export interface StationOpeningWindowUtc {
  opensAtUtc: Date;
  closesAtUtc: Date;
  dateOnly: string;
  timezone: string;
  spansMidnight: boolean;
}

export interface OverdueRelativeToStationResult {
  overdue: boolean;
  overdueByMs: number;
  dueAtUtc: Date;
  evaluatedAtUtc: Date;
  timezone: string;
  dueLocalDate: string;
  evaluatedLocalDate: string;
}

export interface FormatStationTimeOptions {
  dateStyle?: 'full' | 'long' | 'medium' | 'short';
  timeStyle?: 'full' | 'long' | 'medium' | 'short';
  hour?: '2-digit' | 'numeric';
  minute?: '2-digit' | 'numeric';
  second?: '2-digit' | 'numeric';
  hour12?: boolean;
}

function timezoneError(
  message: string,
  code: StationTimezoneValidationCode,
  details?: Record<string, unknown>,
): never {
  throw new StationTimezoneError(message, code, details);
}

export function normalizeStationTimezone(
  timezone: string | null | undefined,
  options: { allowDefault?: boolean } = {},
): string {
  const trimmed = timezone?.trim();
  if (!trimmed) {
    if (options.allowDefault === false) {
      timezoneError('Station timezone is required', StationTimezoneValidationCode.INVALID_TIMEZONE);
    }
    return DEFAULT_STATION_TIMEZONE;
  }
  if (!isValidIanaTimezone(trimmed)) {
    timezoneError(
      `Station timezone "${trimmed}" is not a valid IANA timezone`,
      StationTimezoneValidationCode.INVALID_TIMEZONE,
      { timezone: trimmed },
    );
  }
  return trimmed;
}

export function parseStationInstant(value: Date | string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      timezoneError('Invalid instant', StationTimezoneValidationCode.INVALID_INSTANT);
    }
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    timezoneError('Invalid instant', StationTimezoneValidationCode.INVALID_INSTANT, { value });
  }
  return parsed;
}

function assertStationDateOnly(dateOnly: string): void {
  if (!DATE_ONLY_RE.test(dateOnly)) {
    timezoneError(
      'dateOnly must use YYYY-MM-DD format',
      StationTimezoneValidationCode.INVALID_DATE,
      { dateOnly },
    );
  }
}

function assertStationTimeOfDay(time: string): void {
  if (!TIME_OF_DAY_RE.test(time)) {
    timezoneError(
      `time must use HH:mm format`,
      StationTimezoneValidationCode.INVALID_TIME,
      { time },
    );
  }
}

function zonedLocalParts(instant: Date, timeZone: string) {
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

  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '0';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

function stationLocalTimeToUtc(
  dateOnly: string,
  time: string,
  timeZone: string,
): Date {
  assertStationDateOnly(dateOnly);
  assertStationTimeOfDay(time);

  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  const lo = Date.UTC(year, month - 2, day, hour - 2, minute, 0);
  const hi = Date.UTC(year, month, day + 1, hour + 2, minute, 59);
  let fallback: Date | null = null;

  for (let ms = lo; ms <= hi; ms += 60_000) {
    const local = zonedLocalParts(new Date(ms), timeZone);
    if (local.year !== year || local.month !== month || local.day !== day) continue;
    if (local.hour !== hour || local.minute !== minute) continue;
    if (local.second === 0) return new Date(ms);
    if (!fallback) fallback = new Date(ms);
  }

  if (fallback) return fallback;

  timezoneError(
    'Local station time could not be resolved in timezone',
    StationTimezoneValidationCode.UNRESOLVABLE_LOCAL_TIME,
    { dateOnly, time, timeZone },
  );
}

function addDaysToStationDateOnly(
  dateOnly: string,
  days: number,
  timeZone: string,
): string {
  const anchor = stationLocalTimeToUtc(dateOnly, '12:00', timeZone);
  return zonedDateOnly(new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000), timeZone);
}

function parseCloseMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  if (time === '23:59') return MINUTES_PER_DAY;
  return hour * 60 + minute;
}

function parseOpenMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

/** Calendar date `YYYY-MM-DD` for an instant in the station timezone. */
export function stationLocalDate(
  instant: Date | string,
  timezone: string,
): string {
  const tz = normalizeStationTimezone(timezone);
  return zonedDateOnly(parseStationInstant(instant), tz);
}

/** Inclusive UTC bounds for a station calendar day. */
export function stationDayBoundsUtc(
  dateOnly: string,
  timezone: string,
): StationDayBoundsUtc {
  const tz = normalizeStationTimezone(timezone);
  assertStationDateOnly(dateOnly);
  const startUtc = zonedStartOfDayToUtc(dateOnly, tz);
  const nextDateOnly = addDaysToStationDateOnly(dateOnly, 1, tz);
  const nextDayStartUtc = zonedStartOfDayToUtc(nextDateOnly, tz);
  return {
    startUtc,
    endUtc: new Date(nextDayStartUtc.getTime() - 1),
    dateOnly,
    timezone: tz,
  };
}

export function isSameStationDay(
  left: Date | string,
  right: Date | string,
  timezone: string,
): boolean {
  const tz = normalizeStationTimezone(timezone);
  return stationLocalDate(left, tz) === stationLocalDate(right, tz);
}

/** Station-local "now" from an explicit UTC reference instant (defaults to current UTC time). */
export function stationNow(
  timezone: string,
  referenceUtc: Date | string = new Date(),
): StationNowContext {
  const tz = normalizeStationTimezone(timezone);
  const instantUtc = parseStationInstant(referenceUtc);
  const localDate = stationLocalDate(instantUtc, tz);
  const parts = zonedLocalParts(instantUtc, tz);
  const localTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  return {
    instantUtc,
    localDate,
    localTime,
    timezone: tz,
  };
}

export function formatStationTime(
  instant: Date | string,
  timezone: string,
  options: FormatStationTimeOptions = {},
): string {
  const tz = normalizeStationTimezone(timezone);
  const parsed = parseStationInstant(instant);
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    dateStyle: options.dateStyle,
    timeStyle: options.timeStyle,
    hour: options.hour,
    minute: options.minute,
    second: options.second,
    hour12: options.hour12,
  }).format(parsed);
}

export function resolveOpeningWindow(
  dateOnly: string,
  slot: StationOpeningHoursTimeSlot,
  timezone: string,
): StationOpeningWindowUtc {
  const tz = normalizeStationTimezone(timezone);
  assertStationDateOnly(dateOnly);
  assertStationTimeOfDay(slot.open);
  assertStationTimeOfDay(slot.close);

  const opensAtUtc = stationLocalTimeToUtc(dateOnly, slot.open, tz);
  const openMinutes = parseOpenMinutes(slot.open);
  const closeMinutes = parseCloseMinutes(slot.close);
  const spansMidnight = closeMinutes <= openMinutes;

  let closeDateOnly = dateOnly;
  if (spansMidnight) {
    closeDateOnly = addDaysToStationDateOnly(dateOnly, 1, tz);
  }

  const closeTime =
    closeMinutes === MINUTES_PER_DAY
      ? '23:59'
      : `${String(Math.floor(closeMinutes / 60)).padStart(2, '0')}:${String(closeMinutes % 60).padStart(2, '0')}`;

  const closesAtUtc = stationLocalTimeToUtc(closeDateOnly, closeTime, tz);

  return {
    opensAtUtc,
    closesAtUtc,
    dateOnly,
    timezone: tz,
    spansMidnight,
  };
}

export function overdueRelativeToStation(
  dueAtUtc: Date | string,
  timezone: string,
  evaluatedAtUtc: Date | string = new Date(),
): OverdueRelativeToStationResult {
  const tz = normalizeStationTimezone(timezone);
  const dueAt = parseStationInstant(dueAtUtc);
  const evaluatedAt = parseStationInstant(evaluatedAtUtc);
  const overdueByMs = Math.max(0, evaluatedAt.getTime() - dueAt.getTime());

  return {
    overdue: overdueByMs > 0,
    overdueByMs,
    dueAtUtc: dueAt,
    evaluatedAtUtc: evaluatedAt,
    timezone: tz,
    dueLocalDate: stationLocalDate(dueAt, tz),
    evaluatedLocalDate: stationLocalDate(evaluatedAt, tz),
  };
}

/** @deprecated Internal reuse alias for tariff default timezone during migration period. */
export const STATION_TIMEZONE_FALLBACK = DEFAULT_TARIFF_TIMEZONE;
