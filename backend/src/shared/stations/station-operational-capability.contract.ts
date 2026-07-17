import { StationStatus } from '@prisma/client';
import {
  StationCalendarExceptionType,
  StationCalendarRecurrenceKind,
} from '@prisma/client';
import { StationOpeningHoursTimeSlot } from './station-opening-hours.contract';

export const STATION_OPERATIONAL_CAPABILITY_VERSION = 1 as const;

export const StationOperationalCapabilityKind = {
  PICKUP_AVAILABLE: 'PICKUP_AVAILABLE',
  RETURN_AVAILABLE: 'RETURN_AVAILABLE',
  AFTER_HOURS_RETURN_AVAILABLE: 'AFTER_HOURS_RETURN_AVAILABLE',
  CLOSED: 'CLOSED',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
  MANUAL_CONFIRMATION_REQUIRED: 'MANUAL_CONFIRMATION_REQUIRED',
  CONFIGURATION_INCOMPLETE: 'CONFIGURATION_INCOMPLETE',
} as const;

export type StationOperationalCapabilityKind =
  (typeof StationOperationalCapabilityKind)[keyof typeof StationOperationalCapabilityKind];

export const StationOperationalCapabilityReasonCode = {
  STATION_ARCHIVED: 'STATION_ARCHIVED',
  STATION_INACTIVE: 'STATION_INACTIVE',
  PICKUP_DISABLED: 'PICKUP_DISABLED',
  RETURN_DISABLED: 'RETURN_DISABLED',
  OUTSIDE_OPENING_HOURS: 'OUTSIDE_OPENING_HOURS',
  CALENDAR_EXCEPTION_CLOSURE: 'CALENDAR_EXCEPTION_CLOSURE',
  CALENDAR_EXCEPTION_MODIFIED_HOURS: 'CALENDAR_EXCEPTION_MODIFIED_HOURS',
  AFTER_HOURS_RETURN_ENABLED: 'AFTER_HOURS_RETURN_ENABLED',
  AFTER_HOURS_RETURN_DISABLED: 'AFTER_HOURS_RETURN_DISABLED',
  KEYBOX_AVAILABLE: 'KEYBOX_AVAILABLE',
  KEYBOX_UNAVAILABLE: 'KEYBOX_UNAVAILABLE',
  TEMPORARY_RULE_OVERRIDE: 'TEMPORARY_RULE_OVERRIDE',
  OPENING_HOURS_MISSING: 'OPENING_HOURS_MISSING',
  TIMEZONE_MISSING: 'TIMEZONE_MISSING',
  TIMEZONE_INVALID: 'TIMEZONE_INVALID',
  WITHIN_OPENING_HOURS: 'WITHIN_OPENING_HOURS',
  LEGACY_HOLIDAY_RULE: 'LEGACY_HOLIDAY_RULE',
} as const;

export type StationOperationalCapabilityReasonCode =
  (typeof StationOperationalCapabilityReasonCode)[keyof typeof StationOperationalCapabilityReasonCode];

export interface StationOperationalCapabilityReason {
  code: StationOperationalCapabilityReasonCode;
  message: string;
}

export interface StationOperationalEffectiveRule {
  ruleId: string;
  source:
    | 'station.status'
    | 'station.capabilities'
    | 'station.opening_hours'
    | 'station.calendar_exception'
    | 'station.legacy_holiday_rules'
    | 'station.temporary_operational_rule';
  description: string;
}

export interface StationOperationalOpeningWindow {
  opensAt: string;
  closesAt: string;
}

export interface StationOperationalCalendarExceptionInput {
  id?: string;
  type: StationCalendarExceptionType;
  title?: string;
  recurrenceKind?: StationCalendarRecurrenceKind;
  calendarDate?: string | null;
  monthDay?: string | null;
  closedAllDay?: boolean;
  slots?: StationOpeningHoursTimeSlot[] | null;
  regionCode?: string | null;
  priority?: number;
  source?: string;
}

export interface StationTemporaryOperationalRule {
  id?: string;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  pickupEnabled?: boolean;
  returnEnabled?: boolean;
  afterHoursReturnEnabled?: boolean;
  keyBoxAvailable?: boolean;
  reason?: string | null;
}

export interface StationOperationalCapabilitySnapshot {
  stationId?: string;
  status: StationStatus;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  timezone: string | null;
  openingHours: unknown;
  calendarExceptions?: StationOperationalCalendarExceptionInput[];
  legacyHolidayRules?: unknown;
  temporaryOperationalRules?: StationTemporaryOperationalRule[];
}

export interface StationOperationalCapabilityEvaluation {
  purpose: 'pickup' | 'return';
  kind: StationOperationalCapabilityKind;
  evaluatedAt: string;
  capabilityVersion: typeof STATION_OPERATIONAL_CAPABILITY_VERSION;
  timezone: string;
  reasons: StationOperationalCapabilityReason[];
  effectiveRule: StationOperationalEffectiveRule | null;
  nextOpeningWindow: StationOperationalOpeningWindow | null;
  effectiveCapabilities: {
    pickupEnabled: boolean;
    returnEnabled: boolean;
    afterHoursReturnEnabled: boolean;
    keyBoxAvailable: boolean;
  };
}

export interface StationOperationalCapabilityResolverResult {
  evaluatedAt: string;
  capabilityVersion: typeof STATION_OPERATIONAL_CAPABILITY_VERSION;
  timezone: string;
  pickup: StationOperationalCapabilityEvaluation;
  return: StationOperationalCapabilityEvaluation;
}

export interface StationOperationalCapabilityContractMetadata {
  version: typeof STATION_OPERATIONAL_CAPABILITY_VERSION;
  timezoneSource: 'station.timezone';
  defaultTimezone: 'Europe/Berlin';
  supportedKinds: StationOperationalCapabilityKind[];
  purposes: Array<'pickup' | 'return'>;
  inputs: string[];
  outputs: string[];
  bookingIntegration: false;
}

export function getStationOperationalCapabilityContractMetadata(): StationOperationalCapabilityContractMetadata {
  return {
    version: STATION_OPERATIONAL_CAPABILITY_VERSION,
    timezoneSource: 'station.timezone',
    defaultTimezone: 'Europe/Berlin',
    supportedKinds: Object.values(StationOperationalCapabilityKind),
    purposes: ['pickup', 'return'],
    inputs: [
      'status',
      'pickupEnabled',
      'returnEnabled',
      'afterHoursReturnEnabled',
      'keyBoxAvailable',
      'timezone',
      'openingHours',
      'calendarExceptions',
      'legacyHolidayRules',
      'temporaryOperationalRules',
    ],
    outputs: [
      'kind',
      'reasons',
      'effectiveRule',
      'nextOpeningWindow',
      'capabilityVersion',
    ],
    bookingIntegration: false,
  };
}
