import {
  evaluateStationCapacityPolicy,
  StationCapacityStatus,
  type StationCapacityVehicleSnapshot,
} from './station-capacity-policy';
import {
  DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
  StationBookingRuleOutcome,
  StationBookingRuleReasonCode,
  STATION_BOOKING_RULES_VERSION,
  type StationBookingRuleEvaluation,
  type StationBookingRuleReason,
  type StationBookingRulesInput,
  type StationBookingRulesOrganizationPolicy,
  type StationBookingRulesResult,
  type StationBookingRulesSide,
  type StationBookingRulesSideResult,
  type StationBookingRulesStationInput,
} from './station-booking-rules.contract';
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

function reason(
  code: StationBookingRuleReasonCode,
  message: string,
): StationBookingRuleReason {
  return { code, message };
}

function parseInstant(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid booking evaluation instant');
  }
  return parsed;
}

function resolvePolicy(
  organizationPolicy?: StationBookingRulesOrganizationPolicy,
): Required<StationBookingRulesOrganizationPolicy> {
  return {
    ...DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
    ...organizationPolicy,
  };
}

function mergeOutcome(
  current: StationBookingRuleOutcome,
  next: StationBookingRuleOutcome,
): StationBookingRuleOutcome {
  return OUTCOME_SEVERITY[next] > OUTCOME_SEVERITY[current] ? next : current;
}

function aggregateSideOutcome(
  evaluations: StationBookingRuleEvaluation[],
): StationBookingRuleOutcome {
  return evaluations.reduce(
    (outcome, evaluation) => mergeOutcome(outcome, evaluation.outcome),
    StationBookingRuleOutcome.ALLOWED,
  );
}

function isHolidayClosure(capability: StationOperationalCapabilityEvaluation): boolean {
  return capability.reasons.some(
    (entry) =>
      entry.code === StationOperationalCapabilityReasonCode.CALENDAR_EXCEPTION_CLOSURE ||
      entry.code === StationOperationalCapabilityReasonCode.LEGACY_HOLIDAY_RULE,
  );
}

function mapCapabilityToEvaluations(
  side: StationBookingRulesSide,
  station: StationBookingRulesStationInput,
  capability: StationOperationalCapabilityEvaluation,
  policy: Required<StationBookingRulesOrganizationPolicy>,
): StationBookingRuleEvaluation[] {
  const evaluations: StationBookingRuleEvaluation[] = [];
  const field = side;
  const stationId = station.id;

  const push = (
    ruleId: string,
    outcome: StationBookingRuleOutcome,
    reasonCode: StationBookingRuleReasonCode,
    message: string,
  ) => {
    evaluations.push({
      ruleId,
      outcome,
      field,
      stationId,
      reason: reason(reasonCode, message),
    });
  };

  switch (capability.kind) {
    case StationOperationalCapabilityKind.ARCHIVED:
      push(
        'station.archived',
        StationBookingRuleOutcome.BLOCKED,
        StationBookingRuleReasonCode.STATION_ARCHIVED,
        'Station is archived and cannot be used for bookings.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.INACTIVE:
      push(
        'station.inactive',
        policy.inactiveStationOutcome,
        StationBookingRuleReasonCode.STATION_INACTIVE,
        'Station is inactive.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE:
      push(
        'station.configuration_incomplete',
        policy.configurationIncompleteOutcome,
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        capability.reasons[0]?.message ??
          'Station configuration is incomplete for booking rules.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.PICKUP_AVAILABLE:
    case StationOperationalCapabilityKind.RETURN_AVAILABLE:
      push(
        'station.available',
        StationBookingRuleOutcome.ALLOWED,
        StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS,
        'Instant is within the effective opening schedule.',
      );
      evaluations[evaluations.length - 1]!.reason = {
        code: 'WITHIN_OPENING_HOURS',
        message: 'Instant is within the effective opening schedule.',
      };
      return evaluations;

    case StationOperationalCapabilityKind.AFTER_HOURS_RETURN_AVAILABLE:
      push(
        'return.after_hours_allowed',
        StationBookingRuleOutcome.ALLOWED,
        StationBookingRuleReasonCode.AFTER_HOURS_ALLOWED,
        'After-hours return is allowed for this station.',
      );
      return evaluations;

    case StationOperationalCapabilityKind.MANUAL_CONFIRMATION_REQUIRED: {
      const requiresKeybox = capability.reasons.some(
        (entry) =>
          entry.code === StationOperationalCapabilityReasonCode.KEYBOX_UNAVAILABLE,
      );
      if (requiresKeybox) {
        push(
          'return.keybox_required',
          StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
          StationBookingRuleReasonCode.KEYBOX_REQUIRED,
          'Keybox is required for after-hours return but is not available.',
        );
      }
      push(
        'station.outside_opening_hours',
        policy.outsideOpeningHoursReturnOutcome,
        StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS,
        'Return is outside opening hours and requires manual confirmation.',
      );
      return evaluations;
    }

    case StationOperationalCapabilityKind.CLOSED: {
      if (side === 'pickup' && !station.pickupEnabled) {
        push(
          'station.pickup_disabled',
          StationBookingRuleOutcome.BLOCKED,
          StationBookingRuleReasonCode.PICKUP_DISABLED,
          'Pickup is disabled for this station.',
        );
        return evaluations;
      }

      if (side === 'return' && !station.returnEnabled) {
        push(
          'station.return_disabled',
          StationBookingRuleOutcome.BLOCKED,
          StationBookingRuleReasonCode.RETURN_DISABLED,
          'Return is disabled for this station.',
        );
        return evaluations;
      }

      if (isHolidayClosure(capability)) {
        push(
          'station.holiday_closure',
          policy.holidayClosureOutcome,
          StationBookingRuleReasonCode.HOLIDAY_CLOSURE,
          capability.reasons.find(
            (entry) =>
              entry.code === StationOperationalCapabilityReasonCode.CALENDAR_EXCEPTION_CLOSURE ||
              entry.code === StationOperationalCapabilityReasonCode.LEGACY_HOLIDAY_RULE,
          )?.message ?? 'Station is closed due to a holiday or calendar exception.',
        );
        return evaluations;
      }

      const outsideOutcome =
        side === 'pickup'
          ? policy.outsideOpeningHoursPickupOutcome
          : policy.outsideOpeningHoursReturnOutcome;

      push(
        'station.outside_opening_hours',
        outsideOutcome,
        StationBookingRuleReasonCode.OUTSIDE_OPENING_HOURS,
        capability.reasons.find(
          (entry) => entry.code === StationOperationalCapabilityReasonCode.OUTSIDE_OPENING_HOURS,
        )?.message ?? 'Requested instant is outside opening hours.',
      );
      return evaluations;
    }

    default:
      push(
        'station.unknown_capability',
        StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        `Unhandled operational capability kind "${capability.kind}".`,
      );
      return evaluations;
  }
}

function buildCapacityVehicles(
  station: StationBookingRulesStationInput,
  vehicle?: StationBookingRulesInput['vehicle'],
): StationCapacityVehicleSnapshot[] {
  const vehicles = [...(station.capacityVehicles ?? [])];
  if (!vehicle) {
    return vehicles;
  }

  const existing = vehicles.find((entry) => entry.id === vehicle.id);
  if (existing) {
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

function evaluateCapacityRules(
  side: StationBookingRulesSide,
  station: StationBookingRulesStationInput,
  vehicle: StationBookingRulesInput['vehicle'],
  policy: Required<StationBookingRulesOrganizationPolicy>,
): StationBookingRuleEvaluation[] {
  if (station.capacity == null) {
    return [];
  }

  const vehicles = buildCapacityVehicles(station, vehicle);
  const bookingProjection = {
    ...(station.capacityBookingProjection ?? {}),
    ...(side === 'pickup' && vehicle
      ? { expectedPickupDepartures: 1 }
      : {}),
    ...(side === 'return' && vehicle ? { expectedReturnArrivals: 1 } : {}),
  };

  const capacity = evaluateStationCapacityPolicy({
    stationId: station.id,
    configuredCapacity: station.capacity,
    vehicles,
    bookingProjection,
  });

  const evaluations: StationBookingRuleEvaluation[] = [];

  if (
    policy.capacityWarningEnabled &&
    (capacity.capacityStatus === StationCapacityStatus.NEAR_CAPACITY ||
      capacity.capacityStatus === StationCapacityStatus.PROJECTED_OVER_CAPACITY)
  ) {
    evaluations.push({
      ruleId: 'station.capacity_warning',
      outcome: StationBookingRuleOutcome.WARNING,
      field: side,
      stationId: station.id,
      reason: reason(
        StationBookingRuleReasonCode.CAPACITY_WARNING,
        `Station capacity is elevated (${capacity.capacityStatus}).`,
      ),
    });
  }

  if (
    capacity.capacityStatus === StationCapacityStatus.FULL ||
    capacity.capacityStatus === StationCapacityStatus.OVER_CAPACITY
  ) {
    evaluations.push({
      ruleId: 'station.capacity_block',
      outcome: policy.capacityBlockAtFull
        ? StationBookingRuleOutcome.BLOCKED
        : StationBookingRuleOutcome.WARNING,
      field: side,
      stationId: station.id,
      reason: reason(
        policy.capacityBlockAtFull
          ? StationBookingRuleReasonCode.CAPACITY_BLOCK
          : StationBookingRuleReasonCode.CAPACITY_WARNING,
        `Station capacity is at or above limit (${capacity.capacityStatus}).`,
      ),
    });
  }

  return evaluations;
}

function evaluateSide(
  side: StationBookingRulesSide,
  station: StationBookingRulesStationInput | null,
  at: Date,
  input: StationBookingRulesInput,
  policy: Required<StationBookingRulesOrganizationPolicy>,
): StationBookingRulesSideResult {
  if (!station) {
    const missingEvaluation: StationBookingRuleEvaluation = {
      ruleId: 'station.missing',
      outcome: StationBookingRuleOutcome.BLOCKED,
      field: side,
      stationId: null,
      reason: reason(
        StationBookingRuleReasonCode.CONFIGURATION_INCOMPLETE,
        `${side === 'pickup' ? 'Pickup' : 'Return'} station is required.`,
      ),
    };
    return {
      side,
      stationId: null,
      outcome: StationBookingRuleOutcome.BLOCKED,
      reasons: [missingEvaluation.reason],
      evaluations: [missingEvaluation],
    };
  }

  const capability = resolveStationOperationalCapability(station, side, { at });
  const evaluations = [
    ...mapCapabilityToEvaluations(side, station, capability, policy),
    ...evaluateCapacityRules(side, station, input.vehicle, policy),
  ];

  const outcome = aggregateSideOutcome(evaluations);

  return {
    side,
    stationId: station.id,
    outcome,
    reasons:
      outcome === StationBookingRuleOutcome.ALLOWED
        ? []
        : evaluations
            .filter((evaluation) => evaluation.outcome !== StationBookingRuleOutcome.ALLOWED)
            .map((evaluation) => evaluation.reason),
    evaluations,
  };
}

export function evaluateStationBookingRules(
  input: StationBookingRulesInput,
): StationBookingRulesResult {
  const policy = resolvePolicy(input.organizationPolicy);
  const pickupAt = parseInstant(input.pickupDateTime);
  const returnAt = parseInstant(input.returnDateTime);
  const evaluatedAt = new Date().toISOString();

  const pickup = evaluateSide('pickup', input.pickupStation, pickupAt, input, policy);
  const returnSide = evaluateSide('return', input.returnStation, returnAt, input, policy);

  return {
    version: STATION_BOOKING_RULES_VERSION,
    evaluatedAt,
    bookingType: input.bookingType,
    pickup,
    return: returnSide,
  };
}

export function getStationBookingRulesMetadata() {
  return {
    version: STATION_BOOKING_RULES_VERSION,
    contract: 'station-booking-rules',
  };
}
