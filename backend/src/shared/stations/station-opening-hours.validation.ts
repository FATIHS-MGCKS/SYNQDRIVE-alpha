import { BadRequestException } from '@nestjs/common';
import {
  getStationOpeningHoursContractMetadata,
  STATION_OPENING_HOURS_CONTRACT_VERSION,
  STATION_OPENING_HOURS_WEEKDAYS,
  StationOpeningHoursDaySchedule,
  StationOpeningHoursPayload,
  StationOpeningHoursTimeSlot,
  StationOpeningHoursValidationCode,
  StationOpeningHoursWeekday,
  StationOpeningHoursV2Schedule,
} from './station-opening-hours.contract';

export * from './station-opening-hours.contract';

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 24 * 60;

type MinuteInterval = [number, number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function openingHoursError(message: string, code: StationOpeningHoursValidationCode): never {
  throw new BadRequestException({ message, code });
}

export function parseStationOpeningHoursTime(time: string): number | null {
  if (!TIME_OF_DAY_RE.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function expandSlotToMinuteIntervals(
  slot: StationOpeningHoursTimeSlot,
): MinuteInterval[] | null {
  const openMinutes = parseStationOpeningHoursTime(slot.open);
  const closeMinutes = parseStationOpeningHoursTime(slot.close);
  if (openMinutes === null || closeMinutes === null) return null;
  if (openMinutes === closeMinutes) return null;
  if (openMinutes < closeMinutes) return [[openMinutes, closeMinutes]];
  return [
    [openMinutes, MINUTES_PER_DAY],
    [0, closeMinutes],
  ];
}

export function minuteIntervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export function slotsHaveOverlap(slots: StationOpeningHoursTimeSlot[]): boolean {
  const intervals: MinuteInterval[] = [];
  for (const slot of slots) {
    const expanded = expandSlotToMinuteIntervals(slot);
    if (!expanded) return true;
    for (const candidate of expanded) {
      for (const existing of intervals) {
        if (minuteIntervalsOverlap(candidate, existing)) return true;
      }
      intervals.push(candidate);
    }
  }
  return false;
}

function isWeekdayKey(key: string): key is StationOpeningHoursWeekday {
  return (STATION_OPENING_HOURS_WEEKDAYS as readonly string[]).includes(key);
}

function isLegacyTextPayload(value: Record<string, unknown>): boolean {
  return 'legacyText' in value;
}

function validateTimeSlot(slot: StationOpeningHoursTimeSlot, dayKey: string): void {
  if (parseStationOpeningHoursTime(slot.open) === null) {
    openingHoursError(
      `openingHours.${dayKey} has invalid open time "${slot.open}"`,
      StationOpeningHoursValidationCode.INVALID_TIME_FORMAT,
    );
  }
  if (parseStationOpeningHoursTime(slot.close) === null) {
    openingHoursError(
      `openingHours.${dayKey} has invalid close time "${slot.close}"`,
      StationOpeningHoursValidationCode.INVALID_TIME_FORMAT,
    );
  }
  if (expandSlotToMinuteIntervals(slot) === null) {
    openingHoursError(
      `openingHours.${dayKey} has invalid slot ${slot.open}–${slot.close}`,
      StationOpeningHoursValidationCode.INVALID_SLOT_RANGE,
    );
  }
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

function validateDaySchedule(dayKey: StationOpeningHoursWeekday, dayValue: unknown): void {
  if (!isRecord(dayValue)) {
    openingHoursError(
      `openingHours.${dayKey} must be an object`,
      StationOpeningHoursValidationCode.INVALID_STRUCTURE,
    );
  }

  const keys = Object.keys(dayValue);
  if (keys.length === 0) {
    openingHoursError(
      `openingHours.${dayKey} cannot be an empty object`,
      StationOpeningHoursValidationCode.EMPTY_DAY,
    );
  }

  if (dayValue.closed === true) {
    if (!keys.every((key) => key === 'closed')) {
      openingHoursError(
        `openingHours.${dayKey} with closed=true cannot contain other fields`,
        StationOpeningHoursValidationCode.INVALID_CLOSED_DAY,
      );
    }
    return;
  }

  if (dayValue.open24h === true) {
    if (!keys.every((key) => key === 'open24h')) {
      openingHoursError(
        `openingHours.${dayKey} with open24h=true cannot contain other fields`,
        StationOpeningHoursValidationCode.INVALID_OPEN24H_DAY,
      );
    }
    return;
  }

  const slots = extractDaySlots(dayValue as unknown as StationOpeningHoursDaySchedule);
  if (slots.length === 0) {
    openingHoursError(
      `openingHours.${dayKey} must define closed, open24h, slots, or open/close`,
      StationOpeningHoursValidationCode.EMPTY_DAY,
    );
  }

  if ('slots' in dayValue && Array.isArray(dayValue.slots) && dayValue.slots.length === 0) {
    openingHoursError(
      `openingHours.${dayKey}.slots cannot be empty`,
      StationOpeningHoursValidationCode.EMPTY_SLOTS,
    );
  }

  for (const slot of slots) {
    if (!isRecord(slot)) {
      openingHoursError(
        `openingHours.${dayKey} contains an invalid slot`,
        StationOpeningHoursValidationCode.INVALID_STRUCTURE,
      );
    }
    validateTimeSlot(slot as StationOpeningHoursTimeSlot, dayKey);
  }

  if (slotsHaveOverlap(slots)) {
    openingHoursError(
      `openingHours.${dayKey} contains overlapping slots`,
      StationOpeningHoursValidationCode.OVERLAPPING_SLOTS,
    );
  }
}

function validateStructuredOpeningHours(value: Record<string, unknown>): void {
  if (
    value.version !== undefined &&
    value.version !== STATION_OPENING_HOURS_CONTRACT_VERSION
  ) {
    openingHoursError(
      `openingHours.version must be ${STATION_OPENING_HOURS_CONTRACT_VERSION}`,
      StationOpeningHoursValidationCode.UNSUPPORTED_VERSION,
    );
  }

  const dayEntries = Object.entries(value).filter(
    ([key]) => key !== 'version' && key !== 'legacyText',
  );
  if (dayEntries.length === 0) return;

  for (const [key, dayValue] of dayEntries) {
    if (!isWeekdayKey(key)) {
      openingHoursError(
        `openingHours contains unknown day key "${key}"`,
        StationOpeningHoursValidationCode.UNKNOWN_WEEKDAY,
      );
    }
    validateDaySchedule(key, dayValue);
  }
}

export function assertValidStationOpeningHours(
  openingHours: StationOpeningHoursPayload | string | Record<string, unknown> | null | undefined,
): void {
  if (openingHours === undefined || openingHours === null) return;

  if (typeof openingHours === 'string') {
    const trimmed = openingHours.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        assertValidStationOpeningHours(parsed);
        return;
      }
    } catch {
      return;
    }
    openingHoursError(
      'openingHours string must be valid JSON or legacy text',
      StationOpeningHoursValidationCode.INVALID_STRUCTURE,
    );
  }

  if (!isRecord(openingHours)) {
    openingHoursError(
      'openingHours must be an object',
      StationOpeningHoursValidationCode.INVALID_STRUCTURE,
    );
  }

  const record: Record<string, unknown> = openingHours;

  if (isLegacyTextPayload(record)) {
    const legacy = record.legacyText;
    if (legacy === undefined || legacy === null || typeof legacy === 'string') return;
    openingHoursError(
      'openingHours.legacyText must be a string',
      StationOpeningHoursValidationCode.INVALID_LEGACY_TEXT,
    );
  }

  validateStructuredOpeningHours(record);
}

export function stationOpeningHoursIsMissing(
  openingHours: unknown,
): boolean {
  if (openingHours == null) return true;
  if (typeof openingHours === 'string') return openingHours.trim().length === 0;
  if (!isRecord(openingHours)) return true;

  if (typeof openingHours.legacyText === 'string' && openingHours.legacyText.trim().length > 0) {
    return false;
  }

  const scheduleKeys = Object.keys(openingHours).filter(
    (key) => key !== 'version' && key !== 'legacyText',
  );
  return scheduleKeys.length === 0;
}

export function normalizeStationOpeningHoursDayForRead(
  day: StationOpeningHoursDaySchedule,
): StationOpeningHoursDaySchedule {
  if (('closed' in day && day.closed === true) || ('open24h' in day && day.open24h === true)) {
    return day;
  }
  if ('slots' in day && Array.isArray(day.slots)) {
    return { slots: day.slots };
  }
  if ('open' in day && 'close' in day) {
    return { slots: [{ open: day.open, close: day.close }] };
  }
  return day;
}

export function normalizeStationOpeningHoursForRead(
  openingHours: unknown,
): unknown {
  if (openingHours == null) return openingHours;
  if (typeof openingHours === 'string') return openingHours;
  if (!isRecord(openingHours)) return openingHours;

  if (typeof openingHours.legacyText === 'string') {
    return { legacyText: openingHours.legacyText };
  }

  const normalized: StationOpeningHoursV2Schedule = {
    version: STATION_OPENING_HOURS_CONTRACT_VERSION,
  };

  for (const weekday of STATION_OPENING_HOURS_WEEKDAYS) {
    const day = openingHours[weekday];
    if (day && isRecord(day)) {
      normalized[weekday] = normalizeStationOpeningHoursDayForRead(
        day as unknown as StationOpeningHoursDaySchedule,
      );
    }
  }

  if (Object.keys(normalized).length === 1) {
    return openingHours;
  }

  return normalized;
}

export function getStationOpeningHoursContractMetadataForApi() {
  return getStationOpeningHoursContractMetadata();
}

/** @deprecated Use STATION_OPENING_HOURS_WEEKDAYS */
export const STATION_WEEKDAYS = STATION_OPENING_HOURS_WEEKDAYS;

/** @deprecated Use StationOpeningHoursWeekday */
export type StationWeekday = StationOpeningHoursWeekday;

/** @deprecated Use assertValidStationOpeningHours */
export function assertValidOpeningHours(
  openingHours: Record<string, unknown> | string | null | undefined,
): void {
  assertValidStationOpeningHours(openingHours);
}
