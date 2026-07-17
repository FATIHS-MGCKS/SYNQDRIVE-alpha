import { StationStatus } from '@prisma/client';
import { calendarExceptionAppliesOnDate } from './station-calendar-exception.validation';
import {
  evaluateStationCapacityPolicy,
  StationCapacityPolicyReason,
  StationCapacityStatus,
  StationCapacityVehicleSnapshot,
} from './station-capacity-policy';
import {
  evaluateStationGeofenceCapability,
  resolveStationGeofenceRuntimeFlagsFromEnv,
  StationGeofenceRuntimeFlags,
} from './station-geofence-capability.policy';
import { StationGeofenceCapabilityReason } from './station-geofence-capability.contract';
import {
  findNextOpeningWindow,
  isStationOpenAt,
} from './station-opening-calendar.util';
import {
  resolveStationOperationalCapabilities,
  StationOperationalCapabilityEvaluation,
  StationOperationalCapabilityKind,
  StationOperationalCapabilityReason,
  StationOperationalCapabilitySnapshot,
  StationOperationalCalendarExceptionInput,
} from './station-operational-capability.resolver';
import { stationOpeningHoursIsMissing } from './station-opening-hours.validation';
import { formatStationTime, stationNow } from './station-timezone.util';
import {
  getStationOperationsContractMetadata,
  STATION_OPERATIONS_VERSION,
  StationAfterHoursCapabilityStatus,
  StationKeyboxStatus,
  StationOpeningStatus,
  StationOperationsCapacityView,
  StationOperationsCapabilityView,
  StationOperationsCalendarExceptionView,
  StationOperationsCurrentStationTime,
  StationOperationsDto,
  StationOperationsGeofenceView,
  StationOperationsLabeledStatus,
  StationOperationsOpeningWindow,
  StationOperationsReason,
  StationOperationsReasonCode,
  StationOperationsReasonSeverity,
} from './station-operations.contract';

export * from './station-operations.contract';

export interface StationOperationsSnapshot extends StationOperationalCapabilitySnapshot {
  organizationId: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  capacity: number | null;
  vehicles: StationCapacityVehicleSnapshot[];
}

export interface ResolveStationOperationsOptions {
  at?: Date | string;
  geofenceRuntime?: StationGeofenceRuntimeFlags;
}

function stationHasMissingCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return latitude == null || longitude == null;
}

function parseInstant(value: Date | string): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid evaluation instant');
  }
  return parsed;
}

function reason(
  code: string,
  message: string,
  severity: StationOperationsReasonSeverity = StationOperationsReasonSeverity.INFO,
): StationOperationsReason {
  return { code, message, severity };
}

function mapOperationalReasons(
  reasons: StationOperationalCapabilityReason[],
  severity: StationOperationsReasonSeverity = StationOperationsReasonSeverity.INFO,
): StationOperationsReason[] {
  return reasons.map((item) => reason(item.code, item.message, severity));
}

function mapCapacityReasons(reasons: StationCapacityPolicyReason[]): StationOperationsReason[] {
  return reasons.map((item) => reason(item.code, item.message, StationOperationsReasonSeverity.INFO));
}

function mapGeofenceReasons(reasons: StationGeofenceCapabilityReason[]): StationOperationsReason[] {
  return reasons.map((item) => reason(item.code, item.message, StationOperationsReasonSeverity.INFO));
}

const CAPABILITY_LABELS: Record<StationOperationalCapabilityKind, string> = {
  [StationOperationalCapabilityKind.PICKUP_AVAILABLE]: 'Abholung verfügbar',
  [StationOperationalCapabilityKind.RETURN_AVAILABLE]: 'Rückgabe verfügbar',
  [StationOperationalCapabilityKind.AFTER_HOURS_RETURN_AVAILABLE]: 'Rückgabe außerhalb der Öffnungszeiten',
  [StationOperationalCapabilityKind.CLOSED]: 'Geschlossen',
  [StationOperationalCapabilityKind.INACTIVE]: 'Station inaktiv',
  [StationOperationalCapabilityKind.ARCHIVED]: 'Station archiviert',
  [StationOperationalCapabilityKind.MANUAL_CONFIRMATION_REQUIRED]: 'Manuelle Bestätigung erforderlich',
  [StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE]: 'Konfiguration unvollständig',
};

const OPENING_STATUS_LABELS: Record<StationOpeningStatus, string> = {
  [StationOpeningStatus.OPEN]: 'Geöffnet',
  [StationOpeningStatus.CLOSED]: 'Geschlossen',
  [StationOpeningStatus.UNKNOWN]: 'Unbekannt',
};

const KEYBOX_STATUS_LABELS: Record<StationKeyboxStatus, string> = {
  [StationKeyboxStatus.AVAILABLE]: 'Schlüsselbox verfügbar',
  [StationKeyboxStatus.UNAVAILABLE]: 'Schlüsselbox nicht verfügbar',
  [StationKeyboxStatus.NOT_APPLICABLE]: 'Schlüsselbox nicht relevant',
  [StationKeyboxStatus.UNKNOWN]: 'Schlüsselbox-Status unbekannt',
};

const AFTER_HOURS_STATUS_LABELS: Record<StationAfterHoursCapabilityStatus, string> = {
  [StationAfterHoursCapabilityStatus.AVAILABLE]: 'Rückgabe außerhalb der Öffnungszeiten verfügbar',
  [StationAfterHoursCapabilityStatus.MANUAL_CONFIRMATION_REQUIRED]:
    'Rückgabe außerhalb der Öffnungszeiten nur mit Bestätigung',
  [StationAfterHoursCapabilityStatus.NOT_AVAILABLE]:
    'Rückgabe außerhalb der Öffnungszeiten nicht verfügbar',
  [StationAfterHoursCapabilityStatus.NOT_CONFIGURED]: 'Außerhalb-der-Öffnungszeiten-Konfiguration unvollständig',
  [StationAfterHoursCapabilityStatus.UNKNOWN]: 'Außerhalb-der-Öffnungszeiten-Status unbekannt',
};

const CAPACITY_STATUS_LABELS: Record<StationCapacityStatus, string> = {
  [StationCapacityStatus.UNKNOWN]: 'Kapazität unbekannt',
  [StationCapacityStatus.AVAILABLE]: 'Kapazität verfügbar',
  [StationCapacityStatus.NEAR_CAPACITY]: 'Kapazität fast ausgeschöpft',
  [StationCapacityStatus.FULL]: 'Kapazität voll',
  [StationCapacityStatus.OVER_CAPACITY]: 'Kapazität überschritten',
  [StationCapacityStatus.PROJECTED_OVER_CAPACITY]: 'Kapazität voraussichtlich überschritten',
};

const GEOFENCE_STATUS_LABELS: Record<string, string> = {
  NOT_CONFIGURED: 'Geofence nicht konfiguriert',
  CONFIGURED_ONLY: 'Geofence konfiguriert (ohne Automation)',
  SHADOW_VALIDATION: 'Geofence-Shadow-Validierung',
  PRODUCTION_ACTIVE: 'Automatische Standorterkennung aktiv',
  DEGRADED: 'Geofence-Automatisierung eingeschränkt',
};

function isCapabilityAvailable(kind: StationOperationalCapabilityKind): boolean {
  return (
    kind === StationOperationalCapabilityKind.PICKUP_AVAILABLE ||
    kind === StationOperationalCapabilityKind.RETURN_AVAILABLE ||
    kind === StationOperationalCapabilityKind.AFTER_HOURS_RETURN_AVAILABLE
  );
}

function toCapabilityView(
  evaluation: StationOperationalCapabilityEvaluation,
): StationOperationsCapabilityView {
  const available = isCapabilityAvailable(evaluation.kind);
  return {
    kind: evaluation.kind,
    label: CAPABILITY_LABELS[evaluation.kind],
    available,
    reasons: mapOperationalReasons(
      evaluation.reasons,
      available ? StationOperationsReasonSeverity.INFO : StationOperationsReasonSeverity.WARNING,
    ),
    nextOpeningWindow: evaluation.nextOpeningWindow,
  };
}

function findActiveCalendarException(
  exceptions: StationOperationalCalendarExceptionInput[] | undefined,
  localDate: string,
): StationOperationalCalendarExceptionInput | null {
  if (!exceptions?.length) return null;
  const applicable = exceptions
    .filter((exception) =>
      calendarExceptionAppliesOnDate(
        {
          recurrenceKind: exception.recurrenceKind ?? 'NONE',
          calendarDate: exception.calendarDate ?? null,
          monthDay: exception.monthDay ?? null,
        },
        localDate,
      ),
    )
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  return applicable[0] ?? null;
}

function resolveOpeningStatus(
  snapshot: StationOperationsSnapshot,
  at: Date,
  timezone: string,
  capabilities: ReturnType<typeof resolveStationOperationalCapabilities>,
): StationOperationsLabeledStatus<StationOpeningStatus> {
  const calendarOptions = {
    calendarExceptions: snapshot.calendarExceptions,
    legacyHolidayRules: snapshot.legacyHolidayRules,
    stationId: snapshot.stationId,
  };

  if (
    capabilities.pickup.kind === StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE ||
    capabilities.return.kind === StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE
  ) {
    return {
      status: StationOpeningStatus.UNKNOWN,
      label: OPENING_STATUS_LABELS[StationOpeningStatus.UNKNOWN],
      reasons: mapOperationalReasons(
        capabilities.pickup.reasons,
        StationOperationsReasonSeverity.WARNING,
      ),
    };
  }

  const openState = isStationOpenAt(at, timezone, snapshot.openingHours, calendarOptions);
  return {
    status: openState.open ? StationOpeningStatus.OPEN : StationOpeningStatus.CLOSED,
    label: openState.open
      ? OPENING_STATUS_LABELS[StationOpeningStatus.OPEN]
      : OPENING_STATUS_LABELS[StationOpeningStatus.CLOSED],
    reasons: openState.open
      ? [reason('STATION_OPERATIONS_OPEN_NOW', 'Station is currently open.', StationOperationsReasonSeverity.INFO)]
      : [
          reason(
            StationOperationsReasonCode.OUTSIDE_OPENING_HOURS,
            'Station is currently closed according to opening calendar.',
            StationOperationsReasonSeverity.INFO,
          ),
        ],
  };
}

function resolveNextOpeningWindow(
  snapshot: StationOperationsSnapshot,
  at: Date,
  timezone: string,
  openingStatus: StationOpeningStatus,
  pickupCapability: StationOperationsCapabilityView,
): StationOperationsOpeningWindow | null {
  if (openingStatus === StationOpeningStatus.UNKNOWN) {
    return null;
  }

  if (openingStatus === StationOpeningStatus.CLOSED) {
    if (pickupCapability.nextOpeningWindow) {
      return pickupCapability.nextOpeningWindow;
    }

    const nextWindow = findNextOpeningWindow(at, timezone, snapshot.openingHours, {
      calendarExceptions: snapshot.calendarExceptions,
      legacyHolidayRules: snapshot.legacyHolidayRules,
      stationId: snapshot.stationId,
    });
    if (!nextWindow) return null;
    return {
      opensAt: nextWindow.opensAt.toISOString(),
      closesAt: nextWindow.closesAt.toISOString(),
    };
  }

  return null;
}

function resolveAfterHoursCapability(
  returnEvaluation: StationOperationalCapabilityEvaluation,
  effectiveAfterHoursEnabled: boolean,
): StationOperationsLabeledStatus<StationAfterHoursCapabilityStatus> {
  if (returnEvaluation.kind === StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE) {
    return {
      status: StationAfterHoursCapabilityStatus.NOT_CONFIGURED,
      label: AFTER_HOURS_STATUS_LABELS[StationAfterHoursCapabilityStatus.NOT_CONFIGURED],
      reasons: mapOperationalReasons(
        returnEvaluation.reasons,
        StationOperationsReasonSeverity.WARNING,
      ),
    };
  }

  if (
    returnEvaluation.kind === StationOperationalCapabilityKind.ARCHIVED ||
    returnEvaluation.kind === StationOperationalCapabilityKind.INACTIVE
  ) {
    return {
      status: StationAfterHoursCapabilityStatus.UNKNOWN,
      label: AFTER_HOURS_STATUS_LABELS[StationAfterHoursCapabilityStatus.UNKNOWN],
      reasons: mapOperationalReasons(returnEvaluation.reasons, StationOperationsReasonSeverity.WARNING),
    };
  }

  if (returnEvaluation.kind === StationOperationalCapabilityKind.AFTER_HOURS_RETURN_AVAILABLE) {
    return {
      status: StationAfterHoursCapabilityStatus.AVAILABLE,
      label: AFTER_HOURS_STATUS_LABELS[StationAfterHoursCapabilityStatus.AVAILABLE],
      reasons: mapOperationalReasons(returnEvaluation.reasons, StationOperationsReasonSeverity.INFO),
    };
  }

  if (returnEvaluation.kind === StationOperationalCapabilityKind.MANUAL_CONFIRMATION_REQUIRED) {
    return {
      status: StationAfterHoursCapabilityStatus.MANUAL_CONFIRMATION_REQUIRED,
      label: AFTER_HOURS_STATUS_LABELS[StationAfterHoursCapabilityStatus.MANUAL_CONFIRMATION_REQUIRED],
      reasons: mapOperationalReasons(returnEvaluation.reasons, StationOperationsReasonSeverity.WARNING),
    };
  }

  if (!effectiveAfterHoursEnabled) {
    return {
      status: StationAfterHoursCapabilityStatus.NOT_AVAILABLE,
      label: AFTER_HOURS_STATUS_LABELS[StationAfterHoursCapabilityStatus.NOT_AVAILABLE],
      reasons: [
        reason(
          StationOperationsReasonCode.AFTER_HOURS_RETURN_DISABLED,
          'After-hours return is not enabled for this station.',
          StationOperationsReasonSeverity.INFO,
        ),
      ],
    };
  }

  return {
    status: StationAfterHoursCapabilityStatus.NOT_AVAILABLE,
    label: AFTER_HOURS_STATUS_LABELS[StationAfterHoursCapabilityStatus.NOT_AVAILABLE],
    reasons: [
      reason(
        StationOperationsReasonCode.OUTSIDE_OPENING_HOURS,
        'After-hours return is only available outside opening hours.',
        StationOperationsReasonSeverity.INFO,
      ),
    ],
  };
}

function resolveKeyboxStatus(
  snapshot: StationOperationsSnapshot,
  capabilities: ReturnType<typeof resolveStationOperationalCapabilities>,
): StationOperationsLabeledStatus<StationKeyboxStatus> {
  if (
    capabilities.pickup.kind === StationOperationalCapabilityKind.ARCHIVED ||
    capabilities.return.kind === StationOperationalCapabilityKind.ARCHIVED
  ) {
    return {
      status: StationKeyboxStatus.NOT_APPLICABLE,
      label: KEYBOX_STATUS_LABELS[StationKeyboxStatus.NOT_APPLICABLE],
      reasons: [
        reason(
          StationOperationsReasonCode.STATION_ARCHIVED,
          'Keybox status is not applicable for archived stations.',
          StationOperationsReasonSeverity.INFO,
        ),
      ],
    };
  }

  if (
    capabilities.pickup.kind === StationOperationalCapabilityKind.INACTIVE ||
    capabilities.return.kind === StationOperationalCapabilityKind.INACTIVE
  ) {
    return {
      status: StationKeyboxStatus.NOT_APPLICABLE,
      label: KEYBOX_STATUS_LABELS[StationKeyboxStatus.NOT_APPLICABLE],
      reasons: [
        reason(
          StationOperationsReasonCode.STATION_INACTIVE,
          'Keybox status is not applicable for inactive stations.',
          StationOperationsReasonSeverity.INFO,
        ),
      ],
    };
  }

  if (capabilities.return.effectiveCapabilities.keyBoxAvailable) {
    return {
      status: StationKeyboxStatus.AVAILABLE,
      label: KEYBOX_STATUS_LABELS[StationKeyboxStatus.AVAILABLE],
      reasons: [
        reason(
          'STATION_OPERATIONS_KEYBOX_AVAILABLE',
          'Keybox is configured for this station.',
          StationOperationsReasonSeverity.INFO,
        ),
      ],
    };
  }

  return {
    status: StationKeyboxStatus.UNAVAILABLE,
    label: KEYBOX_STATUS_LABELS[StationKeyboxStatus.UNAVAILABLE],
    reasons: [
      reason(
        StationOperationsReasonCode.KEYBOX_UNAVAILABLE,
        'Keybox is not configured for this station.',
        StationOperationsReasonSeverity.INFO,
      ),
    ],
  };
}

function resolveCalendarExceptionView(
  snapshot: StationOperationsSnapshot,
  localDate: string,
): StationOperationsCalendarExceptionView {
  const activeException = findActiveCalendarException(snapshot.calendarExceptions, localDate);
  if (!activeException) {
    return {
      active: false,
      exception: null,
      label: 'Keine Kalenderausnahme aktiv',
      reasons: [],
    };
  }

  return {
    active: true,
    exception: {
      id: activeException.id,
      type: activeException.type,
      title: activeException.title,
      closedAllDay: activeException.closedAllDay,
      source: activeException.source,
    },
    label: activeException.title?.trim() || 'Kalenderausnahme aktiv',
    reasons: [
      reason(
        StationOperationsReasonCode.CALENDAR_EXCEPTION_ACTIVE,
        `Calendar exception "${activeException.title ?? activeException.type}" applies on ${localDate}.`,
        StationOperationsReasonSeverity.INFO,
      ),
    ],
  };
}

function resolveCapacityView(
  snapshot: StationOperationsSnapshot,
): StationOperationsCapacityView {
  const evaluation = evaluateStationCapacityPolicy({
    stationId: snapshot.stationId ?? 'unknown',
    configuredCapacity: snapshot.capacity,
    vehicles: snapshot.vehicles,
  });

  return {
    status: evaluation.capacityStatus,
    label: CAPACITY_STATUS_LABELS[evaluation.capacityStatus],
    configuredCapacity: evaluation.configuredCapacity,
    currentOnSiteCount: evaluation.currentOnSiteCount,
    availablePhysicalSlots: evaluation.availablePhysicalSlots,
    projectedOccupancy: evaluation.projectedOccupancy,
    reasons: mapCapacityReasons(evaluation.reasons),
  };
}

function resolveGeofenceView(
  snapshot: StationOperationsSnapshot,
  runtime: StationGeofenceRuntimeFlags,
): StationOperationsGeofenceView {
  const evaluation = evaluateStationGeofenceCapability(
    {
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      radiusMeters: snapshot.radiusMeters,
    },
    runtime,
  );

  return {
    status: evaluation.status,
    label: GEOFENCE_STATUS_LABELS[evaluation.status] ?? evaluation.status,
    geofenceConfigured: evaluation.geofenceConfigured,
    automationActive: evaluation.automationActive,
    writesCurrentStationId: evaluation.writesCurrentStationId,
    publishesConfirmedArrival: evaluation.publishesConfirmedArrival,
    allowsAutomaticLocationDetectionClaim: evaluation.allowsAutomaticLocationDetectionClaim,
    uiHint: evaluation.uiHint,
    reasons: mapGeofenceReasons(evaluation.reasons),
  };
}

function buildConfigurationProblems(
  snapshot: StationOperationsSnapshot,
  geofence: StationOperationsGeofenceView,
): StationOperationsReason[] {
  const problems: StationOperationsReason[] = [];

  if (stationHasMissingCoordinates(snapshot.latitude, snapshot.longitude)) {
    problems.push(
      reason(
        StationOperationsReasonCode.COORDINATES_MISSING,
        'Station coordinates are missing.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  if (!snapshot.timezone?.trim()) {
    problems.push(
      reason(
        StationOperationsReasonCode.TIMEZONE_MISSING,
        'Station timezone is missing.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  if (stationOpeningHoursIsMissing(snapshot.openingHours)) {
    problems.push(
      reason(
        StationOperationsReasonCode.OPENING_HOURS_MISSING,
        'Structured opening hours are missing.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  if (snapshot.capacity == null) {
    problems.push(
      reason(
        StationOperationsReasonCode.CAPACITY_NOT_CONFIGURED,
        'Station capacity is not configured.',
        StationOperationsReasonSeverity.INFO,
      ),
    );
  }

  if (!geofence.geofenceConfigured) {
    problems.push(
      reason(
        StationOperationsReasonCode.GEOFENCE_NOT_CONFIGURED,
        'Geofence is not fully configured.',
        StationOperationsReasonSeverity.INFO,
      ),
    );
  }

  if (snapshot.status === StationStatus.ARCHIVED) {
    problems.push(
      reason(
        StationOperationsReasonCode.STATION_ARCHIVED,
        'Station is archived.',
        StationOperationsReasonSeverity.ERROR,
      ),
    );
  }

  if (snapshot.status === StationStatus.INACTIVE) {
    problems.push(
      reason(
        StationOperationsReasonCode.STATION_INACTIVE,
        'Station is inactive.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  return problems;
}

function buildOperationalWarnings(
  snapshot: StationOperationsSnapshot,
  capabilities: ReturnType<typeof resolveStationOperationalCapabilities>,
  capacity: StationOperationsCapacityView,
  calendarException: StationOperationsCalendarExceptionView,
): StationOperationsReason[] {
  const warnings: StationOperationsReason[] = [];

  if (capacity.status === StationCapacityStatus.NEAR_CAPACITY) {
    warnings.push(
      reason(
        StationOperationsReasonCode.CAPACITY_NEAR_LIMIT,
        'Station is near physical capacity.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  if (capacity.status === StationCapacityStatus.FULL) {
    warnings.push(
      reason(
        StationOperationsReasonCode.CAPACITY_FULL,
        'Station is at physical capacity.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  if (capacity.status === StationCapacityStatus.OVER_CAPACITY) {
    warnings.push(
      reason(
        StationOperationsReasonCode.CAPACITY_OVER,
        'Station is over physical capacity.',
        StationOperationsReasonSeverity.ERROR,
      ),
    );
  }

  if (capacity.status === StationCapacityStatus.PROJECTED_OVER_CAPACITY) {
    warnings.push(
      reason(
        StationOperationsReasonCode.CAPACITY_PROJECTED_OVER,
        'Station is projected to exceed physical capacity.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  if (calendarException.active && calendarException.exception?.closedAllDay) {
    warnings.push(
      reason(
        StationOperationsReasonCode.CALENDAR_EXCEPTION_ACTIVE,
        'A full-day calendar exception is active today.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  if (snapshot.pickupEnabled && !isCapabilityAvailable(capabilities.pickup.kind)) {
    warnings.push(
      reason(
        StationOperationsReasonCode.PICKUP_DISABLED,
        'Pickup is enabled in configuration but not currently available.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  if (snapshot.returnEnabled && !isCapabilityAvailable(capabilities.return.kind)) {
    warnings.push(
      reason(
        StationOperationsReasonCode.RETURN_DISABLED,
        'Return is enabled in configuration but not currently available.',
        StationOperationsReasonSeverity.WARNING,
      ),
    );
  }

  return warnings;
}

function buildCurrentStationTime(
  timezone: string,
  at: Date,
): StationOperationsCurrentStationTime {
  const now = stationNow(timezone, at);
  return {
    instantUtc: now.instantUtc.toISOString(),
    localDate: now.localDate,
    localTime: now.localTime,
    timezone: now.timezone,
    label: formatStationTime(at, timezone, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  };
}

export function resolveStationOperations(
  snapshot: StationOperationsSnapshot,
  options: ResolveStationOperationsOptions = {},
): StationOperationsDto {
  const at = options.at ? parseInstant(options.at) : new Date();
  const geofenceRuntime = options.geofenceRuntime ?? resolveStationGeofenceRuntimeFlagsFromEnv();
  const capabilities = resolveStationOperationalCapabilities(snapshot, { at });
  const timezone = capabilities.timezone;

  const pickupCapability = toCapabilityView(capabilities.pickup);
  const returnCapability = toCapabilityView(capabilities.return);
  const openingStatus = resolveOpeningStatus(snapshot, at, timezone, capabilities);
  const nextOpeningWindow = resolveNextOpeningWindow(
    snapshot,
    at,
    timezone,
    openingStatus.status,
    pickupCapability,
  );
  const afterHoursCapability = resolveAfterHoursCapability(
    capabilities.return,
    capabilities.return.effectiveCapabilities.afterHoursReturnEnabled,
  );
  const keyboxStatus = resolveKeyboxStatus(snapshot, capabilities);
  const currentStationTime = buildCurrentStationTime(timezone, at);
  const calendarException = resolveCalendarExceptionView(snapshot, currentStationTime.localDate);
  const capacityStatus = resolveCapacityView(snapshot);
  const geofenceCapability = resolveGeofenceView(snapshot, geofenceRuntime);
  const configurationProblems = buildConfigurationProblems(snapshot, geofenceCapability);
  const operationalWarnings = buildOperationalWarnings(
    snapshot,
    capabilities,
    capacityStatus,
    calendarException,
  );

  return {
    stationId: snapshot.stationId ?? 'unknown',
    organizationId: snapshot.organizationId,
    evaluatedAt: at.toISOString(),
    operationsVersion: STATION_OPERATIONS_VERSION,
    currentStationTime,
    openingStatus,
    nextOpeningWindow,
    pickupCapability,
    returnCapability,
    afterHoursCapability,
    keyboxStatus,
    calendarException,
    capacityStatus,
    geofenceCapability,
    configurationProblems,
    operationalWarnings,
  };
}

export function getStationOperationsMetadata() {
  return getStationOperationsContractMetadata();
}
