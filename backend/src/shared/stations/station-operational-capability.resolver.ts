import { StationStatus } from '@prisma/client';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import { isValidIanaTimezone } from '@modules/vehicles/diagnostic/vehicle-booking-handover-diagnostic.util';
import { stationOpeningHoursIsMissing } from './station-opening-hours.validation';
import {
  findNextOpeningWindow,
  isStationOpenAt,
  ResolvedOpeningWindow,
} from './station-opening-calendar.util';
import {
  getStationOperationalCapabilityContractMetadata,
  STATION_OPERATIONAL_CAPABILITY_VERSION,
  StationOperationalCapabilityEvaluation,
  StationOperationalCapabilityKind,
  StationOperationalCapabilityReason,
  StationOperationalCapabilityReasonCode,
  StationOperationalCapabilityResolverResult,
  StationOperationalCapabilitySnapshot,
  StationOperationalEffectiveRule,
  StationOperationalOpeningWindow,
  StationTemporaryOperationalRule,
} from './station-operational-capability.contract';

export * from './station-operational-capability.contract';
export * from './station-opening-calendar.util';

function reason(
  code: StationOperationalCapabilityReasonCode,
  message: string,
): StationOperationalCapabilityReason {
  return { code, message };
}

function toOpeningWindow(window: ResolvedOpeningWindow | null): StationOperationalOpeningWindow | null {
  if (!window) return null;
  return {
    opensAt: window.opensAt.toISOString(),
    closesAt: window.closesAt.toISOString(),
  };
}

function toEffectiveRule(window: ResolvedOpeningWindow | null): StationOperationalEffectiveRule | null {
  if (!window) return null;
  return {
    ruleId: window.ruleId,
    source: window.source as StationOperationalEffectiveRule['source'],
    description: window.description,
  };
}

function parseInstant(value: Date | string): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid evaluation instant');
  }
  return parsed;
}

function isRuleActive(
  rule: StationTemporaryOperationalRule,
  at: Date,
): boolean {
  const from = parseInstant(rule.effectiveFrom);
  if (from.getTime() > at.getTime()) return false;
  if (!rule.effectiveTo) return true;
  const to = parseInstant(rule.effectiveTo);
  return at.getTime() < to.getTime();
}

export function mergeEffectiveCapabilities(
  snapshot: StationOperationalCapabilitySnapshot,
  at: Date,
): {
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  appliedRule: StationTemporaryOperationalRule | null;
} {
  const merged = {
    pickupEnabled: snapshot.pickupEnabled,
    returnEnabled: snapshot.returnEnabled,
    afterHoursReturnEnabled: snapshot.afterHoursReturnEnabled,
    keyBoxAvailable: snapshot.keyBoxAvailable,
  };

  const activeRules = (snapshot.temporaryOperationalRules ?? [])
    .filter((rule) => isRuleActive(rule, at))
    .sort(
      (left, right) =>
        parseInstant(left.effectiveFrom).getTime() - parseInstant(right.effectiveFrom).getTime(),
    );

  const appliedRule = activeRules.at(-1) ?? null;
  for (const rule of activeRules) {
    if (rule.pickupEnabled !== undefined) merged.pickupEnabled = rule.pickupEnabled;
    if (rule.returnEnabled !== undefined) merged.returnEnabled = rule.returnEnabled;
    if (rule.afterHoursReturnEnabled !== undefined) {
      merged.afterHoursReturnEnabled = rule.afterHoursReturnEnabled;
    }
    if (rule.keyBoxAvailable !== undefined) merged.keyBoxAvailable = rule.keyBoxAvailable;
  }

  return { ...merged, appliedRule };
}

function evaluateLifecycle(
  status: StationStatus,
): Pick<StationOperationalCapabilityEvaluation, 'kind' | 'reasons' | 'effectiveRule'> | null {
  if (status === 'ARCHIVED') {
    return {
      kind: StationOperationalCapabilityKind.ARCHIVED,
      reasons: [
        reason(
          StationOperationalCapabilityReasonCode.STATION_ARCHIVED,
          'Station is archived and cannot accept operational pickup or return.',
        ),
      ],
      effectiveRule: {
        ruleId: 'station.status.archived',
        source: 'station.status',
        description: 'Station status is ARCHIVED',
      },
    };
  }

  if (status === 'INACTIVE') {
    return {
      kind: StationOperationalCapabilityKind.INACTIVE,
      reasons: [
        reason(
          StationOperationalCapabilityReasonCode.STATION_INACTIVE,
          'Station is inactive and cannot accept operational pickup or return.',
        ),
      ],
      effectiveRule: {
        ruleId: 'station.status.inactive',
        source: 'station.status',
        description: 'Station status is INACTIVE',
      },
    };
  }

  return null;
}

function openingHoursRequiresManualConfiguration(openingHours: unknown): boolean {
  if (stationOpeningHoursIsMissing(openingHours)) return true;
  if (typeof openingHours === 'string' && openingHours.trim()) return true;
  if (
    openingHours != null &&
    typeof openingHours === 'object' &&
    'legacyText' in openingHours &&
    typeof (openingHours as { legacyText?: unknown }).legacyText === 'string' &&
    (openingHours as { legacyText: string }).legacyText.trim()
  ) {
    return true;
  }
  return false;
}

function evaluateConfiguration(
  snapshot: StationOperationalCapabilitySnapshot,
  timezone: string,
): Pick<StationOperationalCapabilityEvaluation, 'kind' | 'reasons' | 'effectiveRule'> | null {
  if (!snapshot.timezone?.trim()) {
    return {
      kind: StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE,
      reasons: [
        reason(
          StationOperationalCapabilityReasonCode.TIMEZONE_MISSING,
          'Station timezone is required for operational capability evaluation.',
        ),
      ],
      effectiveRule: {
        ruleId: 'station.timezone.missing',
        source: 'station.opening_hours',
        description: 'Station timezone is missing',
      },
    };
  }

  if (!isValidIanaTimezone(timezone)) {
    return {
      kind: StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE,
      reasons: [
        reason(
          StationOperationalCapabilityReasonCode.TIMEZONE_INVALID,
          `Station timezone "${timezone}" is not a valid IANA timezone.`,
        ),
      ],
      effectiveRule: {
        ruleId: 'station.timezone.invalid',
        source: 'station.opening_hours',
        description: 'Station timezone is invalid',
      },
    };
  }

  if (openingHoursRequiresManualConfiguration(snapshot.openingHours)) {
    return {
      kind: StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE,
      reasons: [
        reason(
          StationOperationalCapabilityReasonCode.OPENING_HOURS_MISSING,
          'Structured opening hours are required for operational capability evaluation.',
        ),
      ],
      effectiveRule: {
        ruleId: 'station.opening_hours.missing',
        source: 'station.opening_hours',
        description: 'Opening hours are missing',
      },
    };
  }

  return null;
}

function evaluatePurpose(
  snapshot: StationOperationalCapabilitySnapshot,
  at: Date,
  purpose: 'pickup' | 'return',
  timezone: string,
  effectiveCapabilities: ReturnType<typeof mergeEffectiveCapabilities>,
): StationOperationalCapabilityEvaluation {
  const lifecycle = evaluateLifecycle(snapshot.status);
  if (lifecycle) {
    return {
      purpose,
      evaluatedAt: at.toISOString(),
      capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
      timezone,
      nextOpeningWindow: null,
      effectiveCapabilities: {
        pickupEnabled: effectiveCapabilities.pickupEnabled,
        returnEnabled: effectiveCapabilities.returnEnabled,
        afterHoursReturnEnabled: effectiveCapabilities.afterHoursReturnEnabled,
        keyBoxAvailable: effectiveCapabilities.keyBoxAvailable,
      },
      ...lifecycle,
    };
  }

  const configuration = evaluateConfiguration(snapshot, timezone);
  if (configuration) {
    return {
      purpose,
      evaluatedAt: at.toISOString(),
      capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
      timezone,
      nextOpeningWindow: null,
      effectiveCapabilities: {
        pickupEnabled: effectiveCapabilities.pickupEnabled,
        returnEnabled: effectiveCapabilities.returnEnabled,
        afterHoursReturnEnabled: effectiveCapabilities.afterHoursReturnEnabled,
        keyBoxAvailable: effectiveCapabilities.keyBoxAvailable,
      },
      ...configuration,
    };
  }

  const reasons: StationOperationalCapabilityReason[] = [];
  if (effectiveCapabilities.appliedRule) {
    reasons.push(
      reason(
        StationOperationalCapabilityReasonCode.TEMPORARY_RULE_OVERRIDE,
        effectiveCapabilities.appliedRule.reason?.trim() ||
          'Temporary operational rule is active for this instant.',
      ),
    );
  }

  const calendarOptions = {
    calendarExceptions: snapshot.calendarExceptions,
    legacyHolidayRules: snapshot.legacyHolidayRules,
    stationId: snapshot.stationId,
  };

  const openState = isStationOpenAt(at, timezone, snapshot.openingHours, calendarOptions);
  const nextWindow = findNextOpeningWindow(at, timezone, snapshot.openingHours, calendarOptions);

  if (purpose === 'pickup' && !effectiveCapabilities.pickupEnabled) {
    return {
      purpose,
      kind: StationOperationalCapabilityKind.CLOSED,
      evaluatedAt: at.toISOString(),
      capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
      timezone,
      reasons: [
        ...reasons,
        reason(
          StationOperationalCapabilityReasonCode.PICKUP_DISABLED,
          'Pickup is disabled for this station.',
        ),
      ],
      effectiveRule: {
        ruleId: 'station.capabilities.pickup_disabled',
        source: 'station.capabilities',
        description: 'pickupEnabled=false',
      },
      nextOpeningWindow: toOpeningWindow(nextWindow),
      effectiveCapabilities: {
        pickupEnabled: effectiveCapabilities.pickupEnabled,
        returnEnabled: effectiveCapabilities.returnEnabled,
        afterHoursReturnEnabled: effectiveCapabilities.afterHoursReturnEnabled,
        keyBoxAvailable: effectiveCapabilities.keyBoxAvailable,
      },
    };
  }

  if (purpose === 'return' && !effectiveCapabilities.returnEnabled) {
    return {
      purpose,
      kind: StationOperationalCapabilityKind.CLOSED,
      evaluatedAt: at.toISOString(),
      capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
      timezone,
      reasons: [
        ...reasons,
        reason(
          StationOperationalCapabilityReasonCode.RETURN_DISABLED,
          'Return is disabled for this station.',
        ),
      ],
      effectiveRule: {
        ruleId: 'station.capabilities.return_disabled',
        source: 'station.capabilities',
        description: 'returnEnabled=false',
      },
      nextOpeningWindow: toOpeningWindow(nextWindow),
      effectiveCapabilities: {
        pickupEnabled: effectiveCapabilities.pickupEnabled,
        returnEnabled: effectiveCapabilities.returnEnabled,
        afterHoursReturnEnabled: effectiveCapabilities.afterHoursReturnEnabled,
        keyBoxAvailable: effectiveCapabilities.keyBoxAvailable,
      },
    };
  }

  if (openState.open) {
    const availableKind =
      purpose === 'pickup'
        ? StationOperationalCapabilityKind.PICKUP_AVAILABLE
        : StationOperationalCapabilityKind.RETURN_AVAILABLE;

    return {
      purpose,
      kind: availableKind,
      evaluatedAt: at.toISOString(),
      capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
      timezone,
      reasons: [
        ...reasons,
        reason(
          StationOperationalCapabilityReasonCode.WITHIN_OPENING_HOURS,
          'Instant is within the effective opening schedule.',
        ),
      ],
      effectiveRule: {
        ruleId: openState.schedule.ruleId,
        source: openState.schedule.source as StationOperationalEffectiveRule['source'],
        description: openState.schedule.description,
      },
      nextOpeningWindow: toOpeningWindow(nextWindow),
      effectiveCapabilities: {
        pickupEnabled: effectiveCapabilities.pickupEnabled,
        returnEnabled: effectiveCapabilities.returnEnabled,
        afterHoursReturnEnabled: effectiveCapabilities.afterHoursReturnEnabled,
        keyBoxAvailable: effectiveCapabilities.keyBoxAvailable,
      },
    };
  }

  if (purpose === 'pickup') {
    return {
      purpose,
      kind: StationOperationalCapabilityKind.CLOSED,
      evaluatedAt: at.toISOString(),
      capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
      timezone,
      reasons: [
        ...reasons,
        reason(
          openState.schedule.kind === 'closed' &&
            openState.schedule.source === 'station.calendar_exception'
            ? StationOperationalCapabilityReasonCode.CALENDAR_EXCEPTION_CLOSURE
            : StationOperationalCapabilityReasonCode.OUTSIDE_OPENING_HOURS,
          openState.schedule.description,
        ),
      ],
      effectiveRule: {
        ruleId: openState.schedule.ruleId,
        source: openState.schedule.source as StationOperationalEffectiveRule['source'],
        description: openState.schedule.description,
      },
      nextOpeningWindow: toOpeningWindow(nextWindow),
      effectiveCapabilities: {
        pickupEnabled: effectiveCapabilities.pickupEnabled,
        returnEnabled: effectiveCapabilities.returnEnabled,
        afterHoursReturnEnabled: effectiveCapabilities.afterHoursReturnEnabled,
        keyBoxAvailable: effectiveCapabilities.keyBoxAvailable,
      },
    };
  }

  if (effectiveCapabilities.afterHoursReturnEnabled && effectiveCapabilities.keyBoxAvailable) {
    return {
      purpose,
      kind: StationOperationalCapabilityKind.AFTER_HOURS_RETURN_AVAILABLE,
      evaluatedAt: at.toISOString(),
      capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
      timezone,
      reasons: [
        ...reasons,
        reason(
          StationOperationalCapabilityReasonCode.OUTSIDE_OPENING_HOURS,
          'Return is outside opening hours.',
        ),
        reason(
          StationOperationalCapabilityReasonCode.AFTER_HOURS_RETURN_ENABLED,
          'After-hours return is enabled for this station.',
        ),
        reason(
          StationOperationalCapabilityReasonCode.KEYBOX_AVAILABLE,
          'Keybox is available for self-service return.',
        ),
      ],
      effectiveRule: {
        ruleId: openState.schedule.ruleId,
        source: openState.schedule.source as StationOperationalEffectiveRule['source'],
        description: openState.schedule.description,
      },
      nextOpeningWindow: toOpeningWindow(nextWindow),
      effectiveCapabilities: {
        pickupEnabled: effectiveCapabilities.pickupEnabled,
        returnEnabled: effectiveCapabilities.returnEnabled,
        afterHoursReturnEnabled: effectiveCapabilities.afterHoursReturnEnabled,
        keyBoxAvailable: effectiveCapabilities.keyBoxAvailable,
      },
    };
  }

  const manualReasons = [
    ...reasons,
    reason(
      StationOperationalCapabilityReasonCode.OUTSIDE_OPENING_HOURS,
      'Return is outside opening hours.',
    ),
  ];

  if (!effectiveCapabilities.afterHoursReturnEnabled) {
    manualReasons.push(
      reason(
        StationOperationalCapabilityReasonCode.AFTER_HOURS_RETURN_DISABLED,
        'After-hours return is not enabled.',
      ),
    );
  } else {
    manualReasons.push(
      reason(
        StationOperationalCapabilityReasonCode.KEYBOX_UNAVAILABLE,
        'Keybox is not available for self-service after-hours return.',
      ),
    );
  }

  return {
    purpose,
    kind: StationOperationalCapabilityKind.MANUAL_CONFIRMATION_REQUIRED,
    evaluatedAt: at.toISOString(),
    capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
    timezone,
    reasons: manualReasons,
    effectiveRule: {
      ruleId: openState.schedule.ruleId,
      source: openState.schedule.source as StationOperationalEffectiveRule['source'],
      description: openState.schedule.description,
    },
    nextOpeningWindow: toOpeningWindow(nextWindow),
    effectiveCapabilities: {
      pickupEnabled: effectiveCapabilities.pickupEnabled,
      returnEnabled: effectiveCapabilities.returnEnabled,
      afterHoursReturnEnabled: effectiveCapabilities.afterHoursReturnEnabled,
      keyBoxAvailable: effectiveCapabilities.keyBoxAvailable,
    },
  };
}

export interface ResolveStationOperationalCapabilityOptions {
  at?: Date | string;
}

export function resolveStationOperationalCapabilities(
  snapshot: StationOperationalCapabilitySnapshot,
  options: ResolveStationOperationalCapabilityOptions = {},
): StationOperationalCapabilityResolverResult {
  const at = options.at ? parseInstant(options.at) : new Date();
  const timezone = snapshot.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
  const effectiveCapabilities = mergeEffectiveCapabilities(snapshot, at);

  return {
    evaluatedAt: at.toISOString(),
    capabilityVersion: STATION_OPERATIONAL_CAPABILITY_VERSION,
    timezone,
    pickup: evaluatePurpose(snapshot, at, 'pickup', timezone, effectiveCapabilities),
    return: evaluatePurpose(snapshot, at, 'return', timezone, effectiveCapabilities),
  };
}

export function resolveStationOperationalCapability(
  snapshot: StationOperationalCapabilitySnapshot,
  purpose: 'pickup' | 'return',
  options: ResolveStationOperationalCapabilityOptions = {},
): StationOperationalCapabilityEvaluation {
  const result = resolveStationOperationalCapabilities(snapshot, options);
  return purpose === 'pickup' ? result.pickup : result.return;
}

export function getStationOperationalCapabilityMetadata() {
  return getStationOperationalCapabilityContractMetadata();
}
