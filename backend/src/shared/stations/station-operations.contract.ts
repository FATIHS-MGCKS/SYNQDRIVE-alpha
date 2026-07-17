import { StationCapacityStatus } from './station-capacity-policy.contract';
import { StationGeofenceCapabilityStatus } from './station-geofence-capability.contract';
import { StationOperationalCapabilityKind } from './station-operational-capability.contract';

export const STATION_OPERATIONS_VERSION = 1 as const;

export const StationOpeningStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type StationOpeningStatus =
  (typeof StationOpeningStatus)[keyof typeof StationOpeningStatus];

export const StationKeyboxStatus = {
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type StationKeyboxStatus =
  (typeof StationKeyboxStatus)[keyof typeof StationKeyboxStatus];

export const StationAfterHoursCapabilityStatus = {
  AVAILABLE: 'AVAILABLE',
  MANUAL_CONFIRMATION_REQUIRED: 'MANUAL_CONFIRMATION_REQUIRED',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type StationAfterHoursCapabilityStatus =
  (typeof StationAfterHoursCapabilityStatus)[keyof typeof StationAfterHoursCapabilityStatus];

export const StationOperationsReasonSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export type StationOperationsReasonSeverity =
  (typeof StationOperationsReasonSeverity)[keyof typeof StationOperationsReasonSeverity];

export const StationOperationsReasonCode = {
  OPENING_HOURS_MISSING: 'STATION_OPERATIONS_OPENING_HOURS_MISSING',
  TIMEZONE_MISSING: 'STATION_OPERATIONS_TIMEZONE_MISSING',
  TIMEZONE_INVALID: 'STATION_OPERATIONS_TIMEZONE_INVALID',
  COORDINATES_MISSING: 'STATION_OPERATIONS_COORDINATES_MISSING',
  CAPACITY_NOT_CONFIGURED: 'STATION_OPERATIONS_CAPACITY_NOT_CONFIGURED',
  GEOFENCE_NOT_CONFIGURED: 'STATION_OPERATIONS_GEOFENCE_NOT_CONFIGURED',
  STATION_ARCHIVED: 'STATION_OPERATIONS_STATION_ARCHIVED',
  STATION_INACTIVE: 'STATION_OPERATIONS_STATION_INACTIVE',
  CALENDAR_EXCEPTION_ACTIVE: 'STATION_OPERATIONS_CALENDAR_EXCEPTION_ACTIVE',
  CAPACITY_NEAR_LIMIT: 'STATION_OPERATIONS_CAPACITY_NEAR_LIMIT',
  CAPACITY_FULL: 'STATION_OPERATIONS_CAPACITY_FULL',
  CAPACITY_OVER: 'STATION_OPERATIONS_CAPACITY_OVER',
  CAPACITY_PROJECTED_OVER: 'STATION_OPERATIONS_CAPACITY_PROJECTED_OVER',
  PICKUP_DISABLED: 'STATION_OPERATIONS_PICKUP_DISABLED',
  RETURN_DISABLED: 'STATION_OPERATIONS_RETURN_DISABLED',
  OUTSIDE_OPENING_HOURS: 'STATION_OPERATIONS_OUTSIDE_OPENING_HOURS',
  AFTER_HOURS_RETURN_DISABLED: 'STATION_OPERATIONS_AFTER_HOURS_RETURN_DISABLED',
  KEYBOX_UNAVAILABLE: 'STATION_OPERATIONS_KEYBOX_UNAVAILABLE',
} as const;

export type StationOperationsReasonCode =
  (typeof StationOperationsReasonCode)[keyof typeof StationOperationsReasonCode];

export interface StationOperationsReason {
  code: string;
  message: string;
  severity: StationOperationsReasonSeverity;
}

export interface StationOperationsLabeledStatus<TStatus extends string> {
  status: TStatus;
  label: string;
  reasons: StationOperationsReason[];
}

export interface StationOperationsCurrentStationTime {
  instantUtc: string;
  localDate: string;
  localTime: string;
  timezone: string;
  label: string;
}

export interface StationOperationsOpeningWindow {
  opensAt: string;
  closesAt: string;
}

export interface StationOperationsCapabilityView {
  kind: StationOperationalCapabilityKind;
  label: string;
  available: boolean;
  reasons: StationOperationsReason[];
  nextOpeningWindow: StationOperationsOpeningWindow | null;
}

export interface StationOperationsCalendarExceptionView {
  active: boolean;
  exception: {
    id?: string;
    type: string;
    title?: string;
    closedAllDay?: boolean;
    source?: string;
  } | null;
  label: string;
  reasons: StationOperationsReason[];
}

export interface StationOperationsCapacityView {
  status: StationCapacityStatus;
  label: string;
  configuredCapacity: number | null;
  currentOnSiteCount: number;
  availablePhysicalSlots: number | null;
  projectedOccupancy: number | null;
  reasons: StationOperationsReason[];
}

export interface StationOperationsGeofenceView {
  status: StationGeofenceCapabilityStatus;
  label: string;
  geofenceConfigured: boolean;
  automationActive: boolean;
  writesCurrentStationId: boolean;
  publishesConfirmedArrival: boolean;
  allowsAutomaticLocationDetectionClaim: boolean;
  uiHint: string;
  reasons: StationOperationsReason[];
}

export interface StationOperationsDto {
  stationId: string;
  organizationId: string;
  evaluatedAt: string;
  operationsVersion: typeof STATION_OPERATIONS_VERSION;
  currentStationTime: StationOperationsCurrentStationTime;
  openingStatus: StationOperationsLabeledStatus<StationOpeningStatus>;
  nextOpeningWindow: StationOperationsOpeningWindow | null;
  pickupCapability: StationOperationsCapabilityView;
  returnCapability: StationOperationsCapabilityView;
  afterHoursCapability: StationOperationsLabeledStatus<StationAfterHoursCapabilityStatus>;
  keyboxStatus: StationOperationsLabeledStatus<StationKeyboxStatus>;
  calendarException: StationOperationsCalendarExceptionView;
  capacityStatus: StationOperationsCapacityView;
  geofenceCapability: StationOperationsGeofenceView;
  configurationProblems: StationOperationsReason[];
  operationalWarnings: StationOperationsReason[];
}

export interface StationOperationsContractMetadata {
  version: typeof STATION_OPERATIONS_VERSION;
  resolver: 'station-operations.resolver';
  frontendRecomputation: false;
  sections: readonly string[];
  openingStatuses: StationOpeningStatus[];
  keyboxStatuses: StationKeyboxStatus[];
  afterHoursStatuses: StationAfterHoursCapabilityStatus[];
}

export function getStationOperationsContractMetadata(): StationOperationsContractMetadata {
  return {
    version: STATION_OPERATIONS_VERSION,
    resolver: 'station-operations.resolver',
    frontendRecomputation: false,
    sections: [
      'currentStationTime',
      'openingStatus',
      'nextOpeningWindow',
      'pickupCapability',
      'returnCapability',
      'afterHoursCapability',
      'keyboxStatus',
      'calendarException',
      'capacityStatus',
      'geofenceCapability',
      'configurationProblems',
      'operationalWarnings',
    ],
    openingStatuses: Object.values(StationOpeningStatus),
    keyboxStatuses: Object.values(StationKeyboxStatus),
    afterHoursStatuses: Object.values(StationAfterHoursCapabilityStatus),
  };
}
