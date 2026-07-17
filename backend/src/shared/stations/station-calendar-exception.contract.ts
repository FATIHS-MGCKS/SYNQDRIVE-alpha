import {
  StationCalendarExceptionSource,
  StationCalendarExceptionStatus,
  StationCalendarExceptionType,
  StationCalendarRecurrenceKind,
} from '@prisma/client';

export const STATION_CALENDAR_EXCEPTION_CONTRACT_VERSION = 1 as const;

export const STATION_CALENDAR_CLOSURE_TYPES: readonly StationCalendarExceptionType[] = [
  StationCalendarExceptionType.STATION_CLOSURE,
  StationCalendarExceptionType.REGIONAL_HOLIDAY,
];

export const STATION_CALENDAR_OPENING_OVERRIDE_TYPES: readonly StationCalendarExceptionType[] = [
  StationCalendarExceptionType.SPECIAL_OPENING,
  StationCalendarExceptionType.MODIFIED_HOURS,
  StationCalendarExceptionType.OPERATIONAL_EXCEPTION,
];

export const StationCalendarExceptionValidationCode = {
  INVALID_STRUCTURE: 'STATION_CALENDAR_EXCEPTION_INVALID_STRUCTURE',
  INVALID_DATE: 'STATION_CALENDAR_EXCEPTION_INVALID_DATE',
  INVALID_MONTH_DAY: 'STATION_CALENDAR_EXCEPTION_INVALID_MONTH_DAY',
  INVALID_TYPE_SHAPE: 'STATION_CALENDAR_EXCEPTION_INVALID_TYPE_SHAPE',
  REGION_CODE_REQUIRED: 'STATION_CALENDAR_EXCEPTION_REGION_CODE_REQUIRED',
  SLOTS_REQUIRED: 'STATION_CALENDAR_EXCEPTION_SLOTS_REQUIRED',
  SLOTS_FORBIDDEN: 'STATION_CALENDAR_EXCEPTION_SLOTS_FORBIDDEN',
  CONFLICT: 'STATION_CALENDAR_EXCEPTION_CONFLICT',
  CLOSURE_OVERRIDES_SPECIAL_OPENING: 'STATION_CALENDAR_EXCEPTION_CLOSURE_OVERRIDES_SPECIAL_OPENING',
  DUPLICATE_ACTIVE_RULE: 'STATION_CALENDAR_EXCEPTION_DUPLICATE_ACTIVE_RULE',
} as const;

export type StationCalendarExceptionValidationCode =
  (typeof StationCalendarExceptionValidationCode)[keyof typeof StationCalendarExceptionValidationCode];

export interface StationCalendarExceptionSlot {
  open: string;
  close: string;
}

export interface StationCalendarExceptionInput {
  type: StationCalendarExceptionType;
  title: string;
  description?: string | null;
  recurrenceKind?: StationCalendarRecurrenceKind;
  calendarDate?: string | null;
  monthDay?: string | null;
  closedAllDay?: boolean;
  slots?: StationCalendarExceptionSlot[] | null;
  regionCode?: string | null;
}

export interface StationCalendarExceptionRecord extends StationCalendarExceptionInput {
  id: string;
  status: StationCalendarExceptionStatus;
  priority: number;
  source: StationCalendarExceptionSource;
  recurrenceKind: StationCalendarRecurrenceKind;
  closedAllDay: boolean;
}

export interface StationCalendarExceptionConflict {
  code: StationCalendarExceptionValidationCode;
  message: string;
  conflictingExceptionId?: string;
}

export interface StationCalendarExceptionContractMetadata {
  version: typeof STATION_CALENDAR_EXCEPTION_CONTRACT_VERSION;
  timezoneSource: 'station.timezone';
  supportedTypes: StationCalendarExceptionType[];
  recurrenceKinds: StationCalendarRecurrenceKind[];
  overrideRule: 'SPECIAL_OPENING overrides closure types on the same calendar day';
  externalHolidayDependency: false;
  legacyHolidayRules: {
    readCompatible: true;
    writePath: 'station_calendar_exceptions';
  };
}

export function getStationCalendarExceptionContractMetadata(): StationCalendarExceptionContractMetadata {
  return {
    version: STATION_CALENDAR_EXCEPTION_CONTRACT_VERSION,
    timezoneSource: 'station.timezone',
    supportedTypes: [
      StationCalendarExceptionType.STATION_CLOSURE,
      StationCalendarExceptionType.SPECIAL_OPENING,
      StationCalendarExceptionType.MODIFIED_HOURS,
      StationCalendarExceptionType.REGIONAL_HOLIDAY,
      StationCalendarExceptionType.OPERATIONAL_EXCEPTION,
    ],
    recurrenceKinds: [
      StationCalendarRecurrenceKind.NONE,
      StationCalendarRecurrenceKind.YEARLY,
    ],
    overrideRule: 'SPECIAL_OPENING overrides closure types on the same calendar day',
    externalHolidayDependency: false,
    legacyHolidayRules: {
      readCompatible: true,
      writePath: 'station_calendar_exceptions',
    },
  };
}

export function defaultPriorityForCalendarExceptionType(
  type: StationCalendarExceptionType,
): number {
  switch (type) {
    case StationCalendarExceptionType.SPECIAL_OPENING:
      return 100;
    case StationCalendarExceptionType.MODIFIED_HOURS:
      return 80;
    case StationCalendarExceptionType.OPERATIONAL_EXCEPTION:
      return 60;
    case StationCalendarExceptionType.REGIONAL_HOLIDAY:
      return 40;
    case StationCalendarExceptionType.STATION_CLOSURE:
    default:
      return 20;
  }
}

export function isClosureCalendarExceptionType(type: StationCalendarExceptionType): boolean {
  return STATION_CALENDAR_CLOSURE_TYPES.includes(type);
}

export function isOpeningOverrideCalendarExceptionType(type: StationCalendarExceptionType): boolean {
  return STATION_CALENDAR_OPENING_OVERRIDE_TYPES.includes(type);
}
