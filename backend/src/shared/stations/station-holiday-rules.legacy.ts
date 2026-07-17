import {
  StationCalendarExceptionSource,
  StationCalendarExceptionType,
  StationCalendarRecurrenceKind,
} from '@prisma/client';
import type { StationCalendarExceptionInput } from './station-calendar-exception.contract';

const LEGACY_TYPE_MAP: Record<string, StationCalendarExceptionType> = {
  closure: StationCalendarExceptionType.STATION_CLOSURE,
  closed: StationCalendarExceptionType.STATION_CLOSURE,
  station_closure: StationCalendarExceptionType.STATION_CLOSURE,
  special_opening: StationCalendarExceptionType.SPECIAL_OPENING,
  special: StationCalendarExceptionType.SPECIAL_OPENING,
  modified_hours: StationCalendarExceptionType.MODIFIED_HOURS,
  hours: StationCalendarExceptionType.MODIFIED_HOURS,
  regional_holiday: StationCalendarExceptionType.REGIONAL_HOLIDAY,
  holiday: StationCalendarExceptionType.REGIONAL_HOLIDAY,
  operational: StationCalendarExceptionType.OPERATIONAL_EXCEPTION,
  operational_exception: StationCalendarExceptionType.OPERATIONAL_EXCEPTION,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseLegacyRule(
  raw: Record<string, unknown>,
  index: number,
): StationCalendarExceptionInput | null {
  const title =
    asString(raw.title) ??
    asString(raw.name) ??
    asString(raw.label) ??
    `Legacy holiday rule ${index + 1}`;

  const typeHint = asString(raw.type)?.toLowerCase();
  const closed = raw.closed === true || raw.isClosed === true;
  const slotsRaw = Array.isArray(raw.slots) ? raw.slots : null;
  const open = asString(raw.open);
  const close = asString(raw.close);
  const slots =
    slotsRaw?.map((slot) => {
      if (!isRecord(slot)) return null;
      const slotOpen = asString(slot.open);
      const slotClose = asString(slot.close);
      if (!slotOpen || !slotClose) return null;
      return { open: slotOpen, close: slotClose };
    }).filter((slot): slot is { open: string; close: string } => slot != null) ??
    (open && close ? [{ open, close }] : null);

  let type = typeHint ? LEGACY_TYPE_MAP[typeHint] : undefined;
  if (!type) {
    if (raw.special === true || raw.specialOpening === true) {
      type = StationCalendarExceptionType.SPECIAL_OPENING;
    } else if (slots?.length) {
      type = StationCalendarExceptionType.MODIFIED_HOURS;
    } else if (closed || asString(raw.regionCode) || asString(raw.region)) {
      type = asString(raw.regionCode) || asString(raw.region)
        ? StationCalendarExceptionType.REGIONAL_HOLIDAY
        : StationCalendarExceptionType.STATION_CLOSURE;
    } else {
      type = StationCalendarExceptionType.OPERATIONAL_EXCEPTION;
    }
  }

  const recurrenceRaw = asString(raw.recurrence)?.toLowerCase();
  const recurrenceKind =
    recurrenceRaw === 'yearly' || recurrenceRaw === 'annual'
      ? StationCalendarRecurrenceKind.YEARLY
      : StationCalendarRecurrenceKind.NONE;

  const calendarDate = asString(raw.date) ?? asString(raw.calendarDate);
  const monthDay = asString(raw.monthDay) ?? asString(raw.month_day);

  if (recurrenceKind === StationCalendarRecurrenceKind.YEARLY) {
    if (!monthDay && calendarDate && calendarDate.length >= 10) {
      return {
        type,
        title,
        description: asString(raw.description),
        recurrenceKind,
        monthDay: calendarDate.slice(5, 10),
        closedAllDay: closed || type === StationCalendarExceptionType.STATION_CLOSURE,
        slots: closed ? null : slots,
        regionCode: asString(raw.regionCode) ?? asString(raw.region),
      };
    }
    if (!monthDay) return null;
    return {
      type,
      title,
      description: asString(raw.description),
      recurrenceKind,
      monthDay,
      closedAllDay: closed || isClosureType(type),
      slots: closed ? null : slots,
      regionCode: asString(raw.regionCode) ?? asString(raw.region),
    };
  }

  if (!calendarDate) return null;

  return {
    type,
    title,
    description: asString(raw.description),
    recurrenceKind: StationCalendarRecurrenceKind.NONE,
    calendarDate: calendarDate.slice(0, 10),
    closedAllDay: closed || isClosureType(type),
    slots: closed ? null : slots,
    regionCode: asString(raw.regionCode) ?? asString(raw.region),
  };
}

function isClosureType(type: StationCalendarExceptionType): boolean {
  return (
    type === StationCalendarExceptionType.STATION_CLOSURE ||
    type === StationCalendarExceptionType.REGIONAL_HOLIDAY
  );
}

export function extractLegacyHolidayRuleEntries(raw: unknown): Record<string, unknown>[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter(isRecord);
  }
  if (!isRecord(raw)) return [];

  const collections = [raw.exceptions, raw.rules, raw.holidays, raw.items];
  for (const collection of collections) {
    if (Array.isArray(collection)) {
      return collection.filter(isRecord);
    }
  }

  if (asString(raw.date) || asString(raw.monthDay)) {
    return [raw];
  }

  return [];
}

export interface ParsedLegacyHolidayRule extends StationCalendarExceptionInput {
  legacyImportKey: string;
  source: StationCalendarExceptionSource;
}

export function parseLegacyHolidayRules(
  raw: unknown,
  stationId: string,
): ParsedLegacyHolidayRule[] {
  const entries = extractLegacyHolidayRuleEntries(raw);
  const parsed: ParsedLegacyHolidayRule[] = [];

  entries.forEach((entry, index) => {
    const mapped = parseLegacyRule(entry, index);
    if (!mapped) return;
    const dateKey =
      mapped.recurrenceKind === StationCalendarRecurrenceKind.YEARLY
        ? `yearly:${mapped.monthDay}`
        : `date:${mapped.calendarDate}`;
    parsed.push({
      ...mapped,
      source: StationCalendarExceptionSource.LEGACY_HOLIDAY_RULES,
      legacyImportKey: `legacy:${stationId}:${dateKey}:${mapped.type}`,
    });
  });

  return parsed;
}

export function legacyHolidayRulesHasEntries(raw: unknown): boolean {
  return extractLegacyHolidayRuleEntries(raw).length > 0;
}
