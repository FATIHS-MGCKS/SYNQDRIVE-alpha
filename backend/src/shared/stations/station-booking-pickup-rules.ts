import {
  evaluateStationCapacityPolicy,
  StationCapacityStatus,
  type StationCapacityVehicleSnapshot,
} from './station-capacity-policy';
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
import { toPickupEffectiveRule } from './station-booking-pickup-rules.contract';
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
  StationBookingRuleReasonCode.PICKUP_DISABLED,
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

function evaluatePickupCapacityRules(
  station: StationBookingRulesStationInput,
  vehicle: StationBookingRulesVehicleInput | null | undefined,
  policy: Required<StationBookingRulesOrganizationPolicy>,
): StationBookingRuleEvaluation[] {
  if (station.capacity == null) {
    return [];
  }

  const capacity = evaluateStationCapacityPolicy({
    stationId: station.id,
    configuredCapacity: station.capacity,
    vehicles: buildCapacityVehicles(station, vehicle),
    bookingProjection: {
      ...(station.capacityBookingProjection ?? {}),
      ...(vehicle ? { expectedPickupDepartures: 1 } : {}),
    },
  });

  const evaluations: StationBookingRuleEvaluation[] = [];

  if (
    policy.capacityWarningEnabled &&
    (capacity.capacityStatus === StationCapacityStatus.NEAR_CAPACITY ||
      capacity.capacityStatus === StationCapacityStatus.PROJECTED_OVER_CAPACITY)
  ) {
    evaluations.push({
      ruleId: 'pickup.capacity_warning',
      outcome: StationBookingRuleOutcome.WARNING,
      field: 'pickup',
      stationId: station.id,
      reason: reason(
        StationBookingRuleReasonCode.CAPACITY_WARNING,
        `Pickup station capacity is elevated (${capacity.capacityStatus}).`,
      ),
    });
  }

  if (
    capacity.capacityStatus === StationCapacityStatus.FULL ||
    capacity.capacityStatus === StationCapacityStatus.OVER_CAPACITY
  ) {
    evaluations.push({
      ruleId: 'pickup.capacity_block',
      outcome: policy.capacityBlockAtFull
        ? StationBookingRuleOutcome.BLOCKED
        : StationBookingRuleOutcome.WARNING,
      field: 'pickup',
      stationId: station.id,
      reason: reason(
        policy.capacityBlockAtFull
          ? StationBookingRuleReasonCode.CAPACITY_BLOCK
          : StationBookingRuleReasonCode.CAPACITY_WARNING,
        `Pickup station capacity is at or above limit (${capacity.capacityStatus}).`,
      ),
    });
  }

  return evaluations;
}

function mapPickupCapabilityEvaluations(
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
      field: 'pickup',
      stationId: station.id,
      reason: reason(reasonCode, message),
    });
  };

  switch (capability.kind) {
    case StationOperationalCapabilityKind.ARCHIVED:
      push(
        'pickup.station_archived',
        StationBookingRuleOutcome.BLOCKED,
        StationBookingRuleReasonCode.STATION_ARCHIVED,
        'Pickup station is archived.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.INACTIVE:
      push(
        'pickup.station_inactive',
        StationBookingRuleOutcome.BLOCKED,
        StationBookingRuleReasonCode.STATION_INACTIVE,
        'Pickup station is inactive.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE:
      push(
        'pickup.configuration_incomplete',
        policy.configurationIncompleteOutcome,
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        capability.reasons[0]?.message ??
          'Pickup station configuration is incomplete (timezone/opening hours).',
      );
      return evaluations;

    case StationOperationalCapabilityKind.PICKUP_AVAILABLE:
      push(
        'pickup.within_opening_hours',
        StationBookingRuleOutcome.ALLOWED,
        'WITHIN_OPENING_HOURS',
        'Pickup instant is within the configured opening schedule.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.CLOSED: {
      if (!station.pickupEnabled) {
        push(
          'pickup.pickup_disabled',
          StationBookingRuleOutcome.BLOCKED,
          StationBookingRuleReasonCode.PICKUP_DISABLED,
          'Pickup is disabled for this station.',
        );
        return evaluations;
      }

      if (isHolidayClosure(capability)) {
        push(
          'pickup.holiday_closure',
          policy.holidayClosureOutcome,
          StationBookingRuleReasonCode.HOLIDAY_CLOSURE,
          capability.reasons.find(
            (entry) =>
              entry.code === StationOperationalCapabilityReasonCode.CALENDAR_EXCEPTION_CLOSURE ||
              entry.code === StationOperationalCapabilityReasonCode.LEGACY_HOLIDAY_RULE,
          )?.message ?? 'Pickup station is closed due to a holiday or calendar exception.',
        );
        return evaluations;
      }

      push(
        'pickup.outside_opening_hours',
        policy.outsideOpeningHoursPickupOutcome,
        StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS,
        capability.reasons.find(
          (entry) => entry.code === StationOperationalCapabilityReasonCode.OUTSIDE_OPENING_HOURS,
        )?.message ?? 'Pickup is outside configured opening hours.',
      );
      return evaluations;
    }

    default:
      push(
        'pickup.unhandled_capability',
        StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        `Unhandled pickup capability "${capability.kind}".`,
      );
      return evaluations;
  }
}

function canApplyAdminPickupOverride(
  bookingContext: StationBookingRulesBookingContext | null | undefined,
): boolean {
  const override = bookingContext?.adminOverride;
  return Boolean(
    bookingContext?.channel === StationBookingRulesBookingChannel.INTERNAL_ADMIN &&
      override?.enabled &&
      override.reason?.trim(),
  );
}

function applyAdminPickupOverride(input: {
  evaluations: StationBookingRuleEvaluation[];
  bookingContext?: StationBookingRulesBookingContext | null;
}): {
  evaluations: StationBookingRuleEvaluation[];
  adminOverrideApplied: boolean;
} {
  if (!canApplyAdminPickupOverride(input.bookingContext)) {
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
            'Internal admin override applied for pickup rules.',
        ),
      };
    }
    return evaluation;
  });

  overriddenEvaluations.push({
    ruleId: 'pickup.admin_override',
    outcome: StationBookingRuleOutcome.ALLOWED,
    field: 'pickup',
    stationId: overriddenEvaluations[0]?.stationId ?? null,
    reason: reason(
      StationBookingRuleReasonCode.ADMIN_OVERRIDE_APPLIED,
      input.bookingContext?.adminOverride?.reason?.trim() ??
        'Internal admin override applied for pickup rules.',
    ),
  });

  return { evaluations: overriddenEvaluations, adminOverrideApplied: true };
}

function buildPickupSideResult(
  evaluations: StationBookingRuleEvaluation[],
  capability: StationOperationalCapabilityEvaluation | null,
  adminOverrideApplied: boolean,
  at: Date,
  stationTimezone: string | null | undefined,
): Pick<StationBookingRulesSideResult, 'outcome' | 'reasons' | 'evaluations' | 'effectiveRule' | 'timezone' | 'evaluatedInstant' | 'adminOverrideApplied'> {
  const outcome = aggregateOutcome(evaluations);
  const timezone = capability?.timezone ?? stationTimezone ?? null;

  return {
    outcome,
    reasons:
      outcome === StationBookingRuleOutcome.ALLOWED
        ? adminOverrideApplied
          ? evaluations
              .filter((evaluation) => evaluation.reason.code === StationBookingRuleReasonCode.ADMIN_OVERRIDE_APPLIED)
              .map((evaluation) => evaluation.reason)
          : []
        : evaluations
            .filter((evaluation) => evaluation.outcome !== StationBookingRuleOutcome.ALLOWED)
            .map((evaluation) => evaluation.reason),
    evaluations,
    effectiveRule: toPickupEffectiveRule(capability?.effectiveRule),
    timezone,
    evaluatedInstant: resolveStationBookingEvaluatedInstant(at, timezone),
    adminOverrideApplied,
  };
}

export function evaluatePickupBookingRules(input: {
  organizationId: string;
  station: StationBookingRulesStationInput | null;
  pickupAt: Date;
  vehicle?: StationBookingRulesVehicleInput | null;
  policy: Required<StationBookingRulesOrganizationPolicy>;
  bookingContext?: StationBookingRulesBookingContext | null;
}): StationBookingRulesSideResult {
  if (!input.station) {
    const missingEvaluation: StationBookingRuleEvaluation = {
      ruleId: 'pickup.station_missing',
      outcome: StationBookingRuleOutcome.BLOCKED,
      field: 'pickup',
      stationId: null,
      reason: reason(
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        'Pickup station is required.',
      ),
    };

    return {
      side: 'pickup',
      stationId: null,
      ...buildPickupSideResult([missingEvaluation], null, false, input.pickupAt, null),
    };
  }

  const station = input.station;
  const evaluations: StationBookingRuleEvaluation[] = [];

  if (station.organizationId && station.organizationId !== input.organizationId) {
    evaluations.push({
      ruleId: 'pickup.org_mismatch',
      outcome: StationBookingRuleOutcome.BLOCKED,
      field: 'pickup',
      stationId: station.id,
      reason: reason(
        StationBookingRuleReasonCode.STATION_ORG_MISMATCH,
        'Pickup station does not belong to the booking organization.',
      ),
    });

    return {
      side: 'pickup',
      stationId: station.id,
      ...buildPickupSideResult(evaluations, null, false, input.pickupAt, station.timezone),
    };
  }

  if (!station.pickupEnabled) {
    evaluations.push({
      ruleId: 'pickup.pickup_disabled',
      outcome: StationBookingRuleOutcome.BLOCKED,
      field: 'pickup',
      stationId: station.id,
      reason: reason(
        StationBookingRuleReasonCode.PICKUP_DISABLED,
        'Pickup is disabled for this station.',
      ),
    });

    return {
      side: 'pickup',
      stationId: station.id,
      ...buildPickupSideResult(evaluations, null, false, input.pickupAt, station.timezone),
    };
  }

  const capability = resolveStationOperationalCapability(station, 'pickup', {
    at: input.pickupAt,
  });

  evaluations.push(
    ...mapPickupCapabilityEvaluations(station, capability, input.policy),
    ...evaluatePickupCapacityRules(station, input.vehicle, input.policy),
  );

  const { evaluations: finalEvaluations, adminOverrideApplied } = applyAdminPickupOverride({
    evaluations,
    bookingContext: input.bookingContext,
  });

  return {
    side: 'pickup',
    stationId: station.id,
    ...buildPickupSideResult(finalEvaluations, capability, adminOverrideApplied, input.pickupAt, station.timezone),
  };
}
