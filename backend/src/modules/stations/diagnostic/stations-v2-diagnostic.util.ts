import { StationStatus } from '@prisma/client';
import { isValidIanaTimezone } from '@modules/vehicles/diagnostic/vehicle-booking-handover-diagnostic.util';
import { assertValidStationOpeningHours } from '@shared/stations/station-opening-hours.validation';
import type { StationOpeningHoursPayload } from '@shared/stations/station-opening-hours.contract';
import {
  evaluateStaleExpectedStationReconciliation,
  type ExpectedStationSnapshot,
} from '@shared/stations/expected-station.policy';
import { resolveStationKpis } from '@shared/stations/station-kpis.resolver';
import { isUuidLike, parseStationIds } from '@shared/stations/station-scope.util';
import {
  DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
  StationBookingRuleOutcome,
  StationBookingRulesBookingType,
} from '@shared/stations/station-booking-rules.contract';
import { evaluatePickupBookingRules } from '@shared/stations/station-booking-pickup-rules';
import { evaluateReturnBookingRules } from '@shared/stations/station-booking-return-rules';
import { deriveIsOneWayFromStationIds } from '@shared/stations/station-booking-return-rules.contract';
import type { StationBookingRulesStationInput } from '@shared/stations/station-booking-rules.contract';
import { STATIONS_V2_DIAGNOSTIC_CHECK_META } from './stations-v2-diagnostic-check-meta';
import type {
  StationsV2DiagnosticCheckId,
  StationsV2DiagnosticFinding,
  StationsV2DiagnosticSeverity,
} from './stations-v2-diagnostic.types';

export const DEFAULT_STATIONS_V2_DIAGNOSTIC_SAMPLE_LIMIT = 25;
export const DEFAULT_STATIONS_V2_BOOKING_LOOKAHEAD_DAYS = 90;

export interface CoordinateInspection {
  valid: boolean;
  code?: string;
  message?: string;
}

export function inspectStationCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): CoordinateInspection {
  const hasLat = latitude !== undefined && latitude !== null;
  const hasLng = longitude !== undefined && longitude !== null;

  if (hasLat !== hasLng) {
    return {
      valid: false,
      code: 'STATION_COORDINATE_PAIR_REQUIRED',
      message: 'latitude and longitude must be provided together',
    };
  }
  if (!hasLat || !hasLng) {
    return { valid: true };
  }

  if (latitude < -90 || latitude > 90) {
    return {
      valid: false,
      code: 'STATION_LATITUDE_OUT_OF_RANGE',
      message: 'latitude must be between -90 and 90',
    };
  }
  if (longitude < -180 || longitude > 180) {
    return {
      valid: false,
      code: 'STATION_LONGITUDE_OUT_OF_RANGE',
      message: 'longitude must be between -180 and 180',
    };
  }

  return { valid: true };
}

export function inspectStationTimezone(timezone: string | null | undefined): CoordinateInspection {
  if (timezone === undefined || timezone === null || timezone.trim() === '') {
    return { valid: true };
  }
  if (!isValidIanaTimezone(timezone.trim())) {
    return {
      valid: false,
      code: 'STATION_INVALID_TIMEZONE',
      message: 'timezone must be a valid IANA timezone',
    };
  }
  return { valid: true };
}

export function inspectStationOpeningHours(openingHours: unknown): CoordinateInspection {
  try {
    assertValidStationOpeningHours(
      openingHours as
        | StationOpeningHoursPayload
        | string
        | Record<string, unknown>
        | null
        | undefined,
    );
    return { valid: true };
  } catch (error) {
    const response = (error as { response?: { code?: string; message?: string } }).response;
    return {
      valid: false,
      code: response?.code ?? 'STATION_INVALID_OPENING_HOURS',
      message: response?.message ?? (error as Error).message,
    };
  }
}

export function stationHasActiveCapabilities(station: {
  status: StationStatus;
  pickupEnabled: boolean;
  returnEnabled: boolean;
}): boolean {
  return station.status === StationStatus.ARCHIVED && (station.pickupEnabled || station.returnEnabled);
}

export function collectScopeStationIdCandidates(input: {
  stationIds?: unknown;
  stationScope?: string | null;
  defaultStationIds?: unknown;
  stationScopeDefault?: string | null;
  defaultStationId?: string | null;
}): string[] {
  const ids = new Set<string>();
  for (const id of parseStationIds(input.stationIds ?? input.defaultStationIds)) {
    ids.add(id);
  }
  for (const legacy of [input.stationScope, input.stationScopeDefault, input.defaultStationId]) {
    const trimmed = legacy?.trim();
    if (trimmed && trimmed !== 'ALL' && isUuidLike(trimmed)) {
      ids.add(trimmed);
    }
  }
  return [...ids];
}

export function isExpectedContextStillValid(input: {
  expectedStationId: string;
  activeTransferToStationId?: string | null;
  activeBookingReturnStationId?: string | null;
}): boolean {
  if (input.activeTransferToStationId === input.expectedStationId) return true;
  if (input.activeBookingReturnStationId === input.expectedStationId) return true;
  return false;
}

export function toBookingRulesStationInput(station: {
  id: string;
  organizationId: string;
  status: StationStatus;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  timezone: string | null;
  openingHours: unknown;
  holidayRules: unknown;
  capacity: number | null;
}): StationBookingRulesStationInput {
  return {
    id: station.id,
    stationId: station.id,
    organizationId: station.organizationId,
    status: station.status,
    pickupEnabled: station.pickupEnabled,
    returnEnabled: station.returnEnabled,
    afterHoursReturnEnabled: station.afterHoursReturnEnabled,
    keyBoxAvailable: station.keyBoxAvailable,
    timezone: station.timezone,
    openingHours: station.openingHours,
    legacyHolidayRules: station.holidayRules,
    capacity: station.capacity,
    calendarExceptions: [],
  };
}

export function evaluateBookingRuleSides(input: {
  organizationId: string;
  pickupStation: StationBookingRulesStationInput | null;
  returnStation: StationBookingRulesStationInput | null;
  pickupAt: Date;
  returnAt: Date;
}): { pickupOutcome: StationBookingRuleOutcome; returnOutcome: StationBookingRuleOutcome } {
  const policy = DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY;
  const pickup = evaluatePickupBookingRules({
    organizationId: input.organizationId,
    station: input.pickupStation,
    pickupAt: input.pickupAt,
    policy,
  });
  const returnSide = evaluateReturnBookingRules({
    organizationId: input.organizationId,
    station: input.returnStation,
    returnAt: input.returnAt,
    policy,
    bookingContext: { bookingId: null },
  });
  return { pickupOutcome: pickup.outcome, returnOutcome: returnSide.outcome };
}

export function resolveBookingRuleSeverity(
  outcome: StationBookingRuleOutcome,
): StationsV2DiagnosticSeverity | null {
  if (outcome === StationBookingRuleOutcome.BLOCKED) return 'error';
  if (outcome === StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED) return 'warning';
  return null;
}

export function buildDiagnosticFinding(
  checkId: StationsV2DiagnosticCheckId,
  input: Omit<StationsV2DiagnosticFinding, 'checkId' | 'category' | 'severity' | 'remediation'> & {
    severity?: StationsV2DiagnosticSeverity;
  },
): StationsV2DiagnosticFinding {
  const meta = STATIONS_V2_DIAGNOSTIC_CHECK_META[checkId];
  return {
    checkId,
    category: meta.category,
    severity: input.severity ?? meta.severity,
    remediation: meta.remediation,
    organizationId: input.organizationId,
    stationId: input.stationId,
    vehicleId: input.vehicleId,
    bookingId: input.bookingId,
    membershipId: input.membershipId,
    message: input.message,
    details: input.details,
  };
}

export function evaluateExpectedStationSnapshot(snapshot: ExpectedStationSnapshot) {
  if (!snapshot.expectedStationId) {
    return { missingProvenance: false, stale: false };
  }
  const missingProvenance =
    !snapshot.expectedStationSource || snapshot.expectedStationSetAt == null;
  return {
    missingProvenance,
    stale: false as boolean,
  };
}

export function evaluateKpiHomeFleetDeviation(input: {
  stationId: string;
  countedHomeFleet: number;
  vehicles: Array<{ id: string; homeStationId: string | null; currentStationId: string | null }>;
}): number | null {
  const kpi = resolveStationKpis({
    stationId: input.stationId,
    timezone: 'UTC',
    evaluatedAt: new Date().toISOString(),
    configuredCapacity: null,
    scope: {
      applied: true,
      mode: 'SCOPED_STATIONS',
      stationId: input.stationId,
    },
    vehicles: input.vehicles.map((vehicle) => ({
      id: vehicle.id,
      homeStationId: vehicle.homeStationId,
      currentStationId: vehicle.currentStationId,
      expectedStationId: null,
      status: 'AVAILABLE',
    })),
  });
  const resolved = kpi.metrics.homeFleetCount.value;
  if (resolved == null || !kpi.metrics.homeFleetCount.known) return null;
  return resolved !== input.countedHomeFleet ? resolved : null;
}

export function evaluateKpiCurrentOnSiteDeviation(input: {
  stationId: string;
  countedOnSite: number;
  vehicles: Array<{ id: string; homeStationId: string | null; currentStationId: string | null }>;
}): number | null {
  const kpi = resolveStationKpis({
    stationId: input.stationId,
    timezone: 'UTC',
    evaluatedAt: new Date().toISOString(),
    configuredCapacity: null,
    scope: {
      applied: true,
      mode: 'SCOPED_STATIONS',
      stationId: input.stationId,
    },
    vehicles: input.vehicles.map((vehicle) => ({
      id: vehicle.id,
      homeStationId: vehicle.homeStationId,
      currentStationId: vehicle.currentStationId,
      expectedStationId: null,
      status: 'AVAILABLE',
    })),
  });
  const resolved = kpi.metrics.currentOnSiteCount.value;
  if (resolved == null || !kpi.metrics.currentOnSiteCount.known) return null;
  return resolved !== input.countedOnSite ? resolved : null;
}

export function deriveIsOneWayBooking(
  pickupStationId: string | null | undefined,
  returnStationId: string | null | undefined,
  isOneWayRental: boolean,
): boolean {
  if (isOneWayRental) return true;
  return deriveIsOneWayFromStationIds(pickupStationId ?? null, returnStationId ?? null);
}

export function evaluateStaleExpected(snapshot: ExpectedStationSnapshot, contextStillValid: boolean) {
  return evaluateStaleExpectedStationReconciliation({ snapshot, contextStillValid });
}
