/**
 * Stations V2 — versioned Opening Hours contract (Prompt 25).
 * Backend is the source of truth; metadata is exposed to clients via API.
 */

export const STATION_OPENING_HOURS_CONTRACT_VERSION = 2 as const;

export const STATION_OPENING_HOURS_WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type StationOpeningHoursWeekday = (typeof STATION_OPENING_HOURS_WEEKDAYS)[number];

/** Days omitted from the schedule are treated as closed. */
export const STATION_OPENING_HOURS_MISSING_DAY_POLICY = 'closed' as const;

export type StationOpeningHoursMissingDayPolicy =
  typeof STATION_OPENING_HOURS_MISSING_DAY_POLICY;

export const STATION_OPENING_HOURS_TIME_FORMAT = 'HH:mm' as const;

export interface StationOpeningHoursTimeSlot {
  open: string;
  close: string;
}

export interface StationOpeningHoursDayClosed {
  closed: true;
}

export interface StationOpeningHoursDayOpen24h {
  open24h: true;
}

export interface StationOpeningHoursDaySlots {
  slots: StationOpeningHoursTimeSlot[];
}

export interface StationOpeningHoursDayLegacySingle {
  open: string;
  close: string;
}

export type StationOpeningHoursDaySchedule =
  | StationOpeningHoursDayClosed
  | StationOpeningHoursDayOpen24h
  | StationOpeningHoursDaySlots
  | StationOpeningHoursDayLegacySingle;

export interface StationOpeningHoursLegacyText {
  legacyText: string;
}

export type StationOpeningHoursV2Schedule = {
  version: typeof STATION_OPENING_HOURS_CONTRACT_VERSION;
} & Partial<Record<StationOpeningHoursWeekday, StationOpeningHoursDaySchedule>>;

export type StationOpeningHoursPayload =
  | StationOpeningHoursLegacyText
  | StationOpeningHoursV2Schedule
  | (Partial<Record<StationOpeningHoursWeekday, StationOpeningHoursDaySchedule>> & {
      version?: number;
    });

export const StationOpeningHoursValidationCode = {
  INVALID_STRUCTURE: 'STATION_OPENING_HOURS_INVALID_STRUCTURE',
  UNSUPPORTED_VERSION: 'STATION_OPENING_HOURS_UNSUPPORTED_VERSION',
  UNKNOWN_WEEKDAY: 'STATION_OPENING_HOURS_UNKNOWN_WEEKDAY',
  EMPTY_DAY: 'STATION_OPENING_HOURS_EMPTY_DAY',
  INVALID_CLOSED_DAY: 'STATION_OPENING_HOURS_INVALID_CLOSED_DAY',
  INVALID_OPEN24H_DAY: 'STATION_OPENING_HOURS_INVALID_OPEN24H_DAY',
  INVALID_TIME_FORMAT: 'STATION_OPENING_HOURS_INVALID_TIME_FORMAT',
  INVALID_SLOT_RANGE: 'STATION_OPENING_HOURS_INVALID_SLOT_RANGE',
  EMPTY_SLOTS: 'STATION_OPENING_HOURS_EMPTY_SLOTS',
  OVERLAPPING_SLOTS: 'STATION_OPENING_HOURS_OVERLAPPING_SLOTS',
  INVALID_LEGACY_TEXT: 'STATION_OPENING_HOURS_INVALID_LEGACY_TEXT',
} as const;

export type StationOpeningHoursValidationCode =
  (typeof StationOpeningHoursValidationCode)[keyof typeof StationOpeningHoursValidationCode];

export interface StationOpeningHoursContractMetadata {
  version: typeof STATION_OPENING_HOURS_CONTRACT_VERSION;
  weekdays: readonly StationOpeningHoursWeekday[];
  missingDayPolicy: StationOpeningHoursMissingDayPolicy;
  timeFormat: typeof STATION_OPENING_HOURS_TIME_FORMAT;
  timezoneSource: 'station.timezone';
  supports: {
    closedDays: true;
    multipleSlots: true;
    breaksViaSlotGaps: true;
    open24h: true;
    midnightSpanningSlots: true;
    legacyText: true;
    legacySingleOpenClose: true;
  };
  notes: string[];
}

export function getStationOpeningHoursContractMetadata(): StationOpeningHoursContractMetadata {
  return {
    version: STATION_OPENING_HOURS_CONTRACT_VERSION,
    weekdays: STATION_OPENING_HOURS_WEEKDAYS,
    missingDayPolicy: STATION_OPENING_HOURS_MISSING_DAY_POLICY,
    timeFormat: STATION_OPENING_HOURS_TIME_FORMAT,
    timezoneSource: 'station.timezone',
    supports: {
      closedDays: true,
      multipleSlots: true,
      breaksViaSlotGaps: true,
      open24h: true,
      midnightSpanningSlots: true,
      legacyText: true,
      legacySingleOpenClose: true,
    },
    notes: [
      'Omitted weekdays are treated as closed.',
      'Breaks are modeled as multiple non-overlapping slots (e.g. 08:00–12:00 and 13:00–18:00).',
      'Slots with close <= open span midnight (e.g. 22:00–06:00).',
      '24-hour operation uses { open24h: true } on a day.',
      'Legacy free-text uses { legacyText: "..." } and skips structural validation.',
    ],
  };
}
