import {
  type StationCapacityVehicleSnapshot,
} from './station-capacity-policy';
import {
  evaluateStationCapacityRules,
  mapCapacityEvaluationsToBookingOutcomes,
  resolveEffectiveCapacityBookingProjection,
  toStationCapacityRulesPolicy,
} from './station-capacity-rules';
import {
  StationBookingRuleOutcome,
  StationBookingRuleReasonCode,
  StationBookingRulesBookingChannel,
  type StationBookingRuleEvaluation,
  type StationBookingRuleReason,
  type StationBookingRulesBookingContext,
  type StationBookingRulesOrganizationPolicy,
  type StationBookingRulesSideResult,
  type StationBookingRulesStationInput,
  type StationBookingRulesVehicleInput,
} from './station-booking-rules.contract';
import { toReturnEffectiveRule } from './station-booking-return-rules.contract';
import { resolveStationBookingEvaluatedInstant } from './station-booking-evaluated-instant.util';
import {
  resolveStationOperationalCapability,
  StationOperationalCapabilityKind,
  StationOperationalCapabilityReasonCode,
  type StationOperationalCapabilityEvaluation,
} from './station-operational-capability.resolver';

const OUTCOME_SEVERITY: Record<StationBookingRuleOutcome, number> = {
  [StationBookingRuleOutcome.ALLOWED]: 0,
  [StationBookingRuleOutcome.WARNING]: 1,
  [StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED]: 2,
  [StationBookingRuleOutcome.BLOCKED]: 3,
};

const HARD_BLOCK_REASON_CODES = new Set<string>([
  StationBookingRuleReasonCode.STATION_ORG_MISMATCH,
  StationBookingRuleReasonCode.STATION_ARCHIVED,
  StationBookingRuleReasonCode.STATION_INACTIVE,
  StationBookingRuleReasonCode.RETURN_DISABLED,
  StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
  StationBookingRuleReasonCode.CAPACITY_BLOCK,
]);

function reason(
  code: StationBookingRuleReasonCode | string,
  message: string,
): StationBookingRuleReason {
  return { code, message };
}

function mergeOutcome(
  current: StationBookingRuleOutcome,
  next: StationBookingRuleOutcome,
): StationBookingRuleOutcome {
  return OUTCOME_SEVERITY[next] > OUTCOME_SEVERITY[current] ? next : current;
}

function aggregateOutcome(evaluations: StationBookingRuleEvaluation[]): StationBookingRuleOutcome {
  return evaluations.reduce(
    (outcome, evaluation) => mergeOutcome(outcome, evaluation.outcome),
    StationBookingRuleOutcome.ALLOWED,
  );
}

function isHolidayClosure(capability: StationOperationalCapabilityEvaluation): boolean {
  if (
    capability.reasons.some(
      (entry) =>
        entry.code === StationOperationalCapabilityReasonCode.CALENDAR_EXCEPTION_CLOSURE ||
        entry.code === StationOperationalCapabilityReasonCode.LEGACY_HOLIDAY_RULE,
    )
  ) {
    return true;
  }

  return capability.effectiveRule?.source === 'station.calendar_exception';
}

function buildCapacityVehicles(
  station: StationBookingRulesStationInput,
  vehicle?: StationBookingRulesVehicleInput | null,
): StationCapacityVehicleSnapshot[] {
  const vehicles = [...(station.capacityVehicles ?? [])];
  if (!vehicle) return vehicles;

  if (vehicles.some((entry) => entry.id === vehicle.id)) {
    return vehicles;
  }

  return [
    ...vehicles,
    {
      id: vehicle.id,
      homeStationId: vehicle.homeStationId ?? null,
      currentStationId: vehicle.currentStationId ?? null,
      expectedStationId: vehicle.expectedStationId ?? null,
      status: vehicle.status ?? 'AVAILABLE',
    },
  ];
}

function evaluateReturnCapacityRules(
  station: StationBookingRulesStationInput,
  vehicle: StationBookingRulesVehicleInput | null | undefined,
  policy: Required<StationBookingRulesOrganizationPolicy>,
): StationBookingRuleEvaluation[] {
  if (station.capacity == null) {
    return [];
  }

  const capacityEvaluations = evaluateStationCapacityRules({
    ruleIdPrefix: 'return',
    policy: toStationCapacityRulesPolicy(policy),
    capacityInput: {
      stationId: station.id,
      configuredCapacity: station.capacity,
      vehicles: buildCapacityVehicles(station, vehicle),
      bookingProjection: resolveEffectiveCapacityBookingProjection(
        station.capacityBookingProjection,
        'return',
        Boolean(vehicle),
      ),
    },
  });

  return mapCapacityEvaluationsToBookingOutcomes(capacityEvaluations, 'return', station.id);
}

function mapReturnCapabilityEvaluations(
  station: StationBookingRulesStationInput,
  capability: StationOperationalCapabilityEvaluation,
  policy: Required<StationBookingRulesOrganizationPolicy>,
): StationBookingRuleEvaluation[] {
  const evaluations: StationBookingRuleEvaluation[] = [];
  const push = (
    ruleId: string,
    outcome: StationBookingRuleOutcome,
    reasonCode: StationBookingRuleReasonCode | string,
    message: string,
  ) => {
    evaluations.push({
      ruleId,
      outcome,
      field: 'return',
      stationId: station.id,
      reason: reason(reasonCode, message),
    });
  };

  switch (capability.kind) {
    case StationOperationalCapabilityKind.ARCHIVED:
      push(
        'return.station_archived',
        StationBookingRuleOutcome.BLOCKED,
        StationBookingRuleReasonCode.STATION_ARCHIVED,
        'Return station is archived.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.INACTIVE:
      push(
        'return.station_inactive',
        StationBookingRuleOutcome.BLOCKED,
        StationBookingRuleReasonCode.STATION_INACTIVE,
        'Return station is inactive.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE:
      push(
        'return.configuration_incomplete',
        policy.configurationIncompleteOutcome,
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        capability.reasons[0]?.message ??
          'Return station configuration is incomplete (timezone/opening hours).',
      );
      return evaluations;

    case StationOperationalCapabilityKind.RETURN_AVAILABLE:
      push(
        'return.within_opening_hours',
        StationBookingRuleOutcome.ALLOWED,
        'WITHIN_OPENING_HOURS',
        'Return instant is within the configured opening schedule.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.AFTER_HOURS_RETURN_AVAILABLE: {
      const presentation = policy.afterHoursReturnAllowedPresentation;
      if (presentation === 'WARNING') {
        push(
          'return.after_hours_allowed',
          StationBookingRuleOutcome.WARNING,
          StationBookingRuleReasonCode.AFTER_HOURS_ALLOWED,
          'After-hours return is allowed for this station.',
        );
      } else {
        push(
          'return.after_hours_allowed',
          StationBookingRuleOutcome.ALLOWED,
          StationBookingRuleReasonCode.ALLOWED_WITH_INFO,
          'After-hours return is allowed for this station (informational).',
        );
      }
      return evaluations;
    }

    case StationOperationalCapabilityKind.MANUAL_CONFIRMATION_REQUIRED: {
      if (isHolidayClosure(capability)) {
        push(
          'return.holiday_closure',
          policy.holidayClosureOutcome,
          StationBookingRuleReasonCode.HOLIDAY_CLOSURE,
          capability.effectiveRule?.description ??
            'Return station is closed due to a holiday or calendar exception.',
        );
        return evaluations;
      }

      const requiresKeybox = capability.reasons.some(
        (entry) => entry.code === StationOperationalCapabilityReasonCode.KEYBOX_UNAVAILABLE,
      );

      if (requiresKeybox) {
        push(
          'return.keybox_required',
          policy.keyboxMissingReturnOutcome,
          StationBookingRuleReasonCode.KEYBOX_REQUIRED,
          'Keybox is required for after-hours return but is not available.',
        );
        return evaluations;
      }

      push(
        'return.outside_opening_hours',
        policy.outsideOpeningHoursReturnOutcome,
        StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS,
        capability.reasons.find(
          (entry) => entry.code === StationOperationalCapabilityReasonCode.OUTSIDE_OPENING_HOURS,
        )?.message ?? 'Return is outside opening hours and requires manual confirmation.',
      );
      return evaluations;
    }

    case StationOperationalCapabilityKind.CLOSED: {
      if (!station.returnEnabled) {
        push(
          'return.return_disabled',
          StationBookingRuleOutcome.BLOCKED,
          StationBookingRuleReasonCode.RETURN_DISABLED,
          'Return is disabled for this station.',
        );
        return evaluations;
      }

      if (isHolidayClosure(capability)) {
        push(
          'return.holiday_closure',
          policy.holidayClosureOutcome,
          StationBookingRuleReasonCode.HOLIDAY_CLOSURE,
          capability.reasons.find(
            (entry) =>
              entry.code === StationOperationalCapabilityReasonCode.CALENDAR_EXCEPTION_CLOSURE ||
              entry.code === StationOperationalCapabilityReasonCode.LEGACY_HOLIDAY_RULE,
          )?.message ?? 'Return station is closed due to a holiday or calendar exception.',
        );
        return evaluations;
      }

      push(
        'return.outside_opening_hours',
        policy.outsideOpeningHoursReturnOutcome,
        StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS,
        capability.reasons.find(
          (entry) => entry.code === StationOperationalCapabilityReasonCode.OUTSIDE_OPENING_HOURS,
        )?.message ?? 'Return is outside configured opening hours.',
      );
      return evaluations;
    }

    default:
      push(
        'return.unhandled_capability',
        StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        `Unhandled return capability "${capability.kind}".`,
      );
      return evaluations;
  }
}

function canApplyAdminReturnOverride(
  bookingContext: StationBookingRulesBookingContext | null | undefined,
): boolean {
  const override = bookingContext?.adminOverride;
  return Boolean(
    bookingContext?.channel === StationBookingRulesBookingChannel.INTERNAL_ADMIN &&
      override?.enabled &&
      override.reason?.trim(),
  );
}

function applyAdminReturnOverride(input: {
  evaluations: StationBookingRuleEvaluation[];
  bookingContext?: StationBookingRulesBookingContext | null;
}): {
  evaluations: StationBookingRuleEvaluation[];
  adminOverrideApplied: boolean;
} {
  if (!canApplyAdminReturnOverride(input.bookingContext)) {
    return { evaluations: input.evaluations, adminOverrideApplied: false };
  }

  const hasHardBlock = input.evaluations.some((evaluation) =>
    HARD_BLOCK_REASON_CODES.has(String(evaluation.reason.code)),
  );
  if (hasHardBlock) {
    return { evaluations: input.evaluations, adminOverrideApplied: false };
  }

  const overriddenEvaluations = input.evaluations.map((evaluation) => {
    if (
      evaluation.outcome === StationBookingRuleOutcome.WARNING ||
      evaluation.outcome === StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED
    ) {
      return {
        ...evaluation,
        outcome: StationBookingRuleOutcome.ALLOWED,
        reason: reason(
          StationBookingRuleReasonCode.ADMIN_OVERRIDE_APPLIED,
          input.bookingContext?.adminOverride?.reason?.trim() ??
            'Internal admin override applied for return rules.',
        ),
      };
    }
    return evaluation;
  });

  overriddenEvaluations.push({
    ruleId: 'return.admin_override',
    outcome: StationBookingRuleOutcome.ALLOWED,
    field: 'return',
    stationId: overriddenEvaluations[0]?.stationId ?? null,
    reason: reason(
      StationBookingRuleReasonCode.ADMIN_OVERRIDE_APPLIED,
      input.bookingContext?.adminOverride?.reason?.trim() ??
        'Internal admin override applied for return rules.',
    ),
  });

  return { evaluations: overriddenEvaluations, adminOverrideApplied: true };
}

function buildReturnSideResult(
  evaluations: StationBookingRuleEvaluation[],
  capability: StationOperationalCapabilityEvaluation | null,
  adminOverrideApplied: boolean,
  at: Date,
  stationTimezone: string | null | undefined,
): Pick<
  StationBookingRulesSideResult,
  'outcome' | 'reasons' | 'evaluations' | 'effectiveRule' | 'timezone' | 'evaluatedInstant' | 'adminOverrideApplied'
> {
  const outcome = aggregateOutcome(evaluations);
  const timezone = capability?.timezone ?? stationTimezone ?? null;
  const informationalReasonCodes = new Set<string>([
    StationBookingRuleReasonCode.ALLOWED_WITH_INFO,
    StationBookingRuleReasonCode.ADMIN_OVERRIDE_APPLIED,
  ]);

  return {
    outcome,
    reasons:
      outcome === StationBookingRuleOutcome.ALLOWED
        ? evaluations
            .filter((evaluation) => informationalReasonCodes.has(String(evaluation.reason.code)))
            .map((evaluation) => evaluation.reason)
        : evaluations
            .filter((evaluation) => evaluation.outcome !== StationBookingRuleOutcome.ALLOWED)
            .map((evaluation) => evaluation.reason),
    evaluations,
    effectiveRule: toReturnEffectiveRule(capability?.effectiveRule),
    timezone,
    evaluatedInstant: resolveStationBookingEvaluatedInstant(at, timezone),
    adminOverrideApplied,
  };
}

export function evaluateReturnBookingRules(input: {
  organizationId: string;
  station: StationBookingRulesStationInput | null;
  returnAt: Date;
  vehicle?: StationBookingRulesVehicleInput | null;
  policy: Required<StationBookingRulesOrganizationPolicy>;
  bookingContext?: StationBookingRulesBookingContext | null;
}): StationBookingRulesSideResult {
  if (!input.station) {
    const missingEvaluation: StationBookingRuleEvaluation = {
      ruleId: 'return.station_missing',
      outcome: StationBookingRuleOutcome.BLOCKED,
      field: 'return',
      stationId: null,
      reason: reason(
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        'Return station is required.',
      ),
    };

    return {
      side: 'return',
      stationId: null,
      ...buildReturnSideResult([missingEvaluation], null, false, input.returnAt, null),
    };
  }

  const station = input.station;
  const evaluations: StationBookingRuleEvaluation[] = [];

  if (station.organizationId && station.organizationId !== input.organizationId) {
    evaluations.push({
      ruleId: 'return.org_mismatch',
      outcome: StationBookingRuleOutcome.BLOCKED,
      field: 'return',
      stationId: station.id,
      reason: reason(
        StationBookingRuleReasonCode.STATION_ORG_MISMATCH,
        'Return station does not belong to the booking organization.',
      ),
    });

    return {
      side: 'return',
      stationId: station.id,
      ...buildReturnSideResult(evaluations, null, false, input.returnAt, station.timezone),
    };
  }

  if (!station.returnEnabled) {
    evaluations.push({
      ruleId: 'return.return_disabled',
      outcome: StationBookingRuleOutcome.BLOCKED,
      field: 'return',
      stationId: station.id,
      reason: reason(
        StationBookingRuleReasonCode.RETURN_DISABLED,
        'Return is disabled for this station.',
      ),
    });

    return {
      side: 'return',
      stationId: station.id,
      ...buildReturnSideResult(evaluations, null, false, input.returnAt, station.timezone),
    };
  }

  const capability = resolveStationOperationalCapability(station, 'return', {
    at: input.returnAt,
  });

  evaluations.push(
    ...mapReturnCapabilityEvaluations(station, capability, input.policy),
    ...evaluateReturnCapacityRules(station, input.vehicle, input.policy),
  );

  const { evaluations: finalEvaluations, adminOverrideApplied } = applyAdminReturnOverride({
    evaluations,
    bookingContext: input.bookingContext,
  });

  return {
    side: 'return',
    stationId: station.id,
    ...buildReturnSideResult(finalEvaluations, capability, adminOverrideApplied, input.returnAt, station.timezone),
  };
}
