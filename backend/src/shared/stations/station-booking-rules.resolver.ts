import { evaluatePickupBookingRules } from './station-booking-pickup-rules';
import { evaluateReturnBookingRules } from './station-booking-return-rules';
import {
  deriveIsOneWayFromStationIds,
} from './station-booking-return-rules.contract';
import {
  DEFAULT_STATION_BOOKING_RULES_ORGANIZATION_POLICY,
  StationBookingRuleOutcome,
  StationBookingRuleReasonCode,
  STATION_BOOKING_RULES_VERSION,
  StationBookingRulesBookingType,
  type StationBookingRuleEvaluation,
  type StationBookingRulesInput,
  type StationBookingRulesOrganizationPolicy,
  type StationBookingRulesResult,
  type StationBookingRulesSideResult,
} from './station-booking-rules.contract';

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

function hasOneWayBookingTypeMismatch(
  bookingType: StationBookingRulesBookingType,
  derivedIsOneWay: boolean,
): boolean {
  if (bookingType === StationBookingRulesBookingType.ONE_WAY) {
    return !derivedIsOneWay;
  }
  if (bookingType === StationBookingRulesBookingType.STANDARD) {
    return derivedIsOneWay;
  }
  return false;
}

function applyOneWayMismatch(
  side: StationBookingRulesSideResult,
): StationBookingRulesSideResult {
  const mismatchEvaluation: StationBookingRuleEvaluation = {
    ruleId: 'booking.one_way_mismatch',
    outcome: StationBookingRuleOutcome.BLOCKED,
    field: side.side,
    stationId: side.stationId,
    reason: {
      code: StationBookingRuleReasonCode.ONE_WAY_MISMATCH,
      message:
        'Booking type does not match pickup/return station selection (one-way vs round-trip).',
    },
  };

  return {
    ...side,
    outcome: StationBookingRuleOutcome.BLOCKED,
    reasons: [mismatchEvaluation.reason, ...side.reasons],
    evaluations: [...side.evaluations, mismatchEvaluation],
  };
}

export function evaluateStationBookingRules(
  input: StationBookingRulesInput,
): StationBookingRulesResult {
  const policy = resolvePolicy(input.organizationPolicy);
  const pickupAt = parseInstant(input.pickupDateTime);
  const returnAt = parseInstant(input.returnDateTime);
  const evaluatedAt = new Date().toISOString();

  const derivedIsOneWay = deriveIsOneWayFromStationIds(
    input.pickupStation?.id,
    input.returnStation?.id,
  );
  const oneWayMismatch = hasOneWayBookingTypeMismatch(input.bookingType, derivedIsOneWay);

  let pickup = evaluatePickupBookingRules({
    organizationId: input.organizationId,
    station: input.pickupStation,
    pickupAt,
    vehicle: input.vehicle,
    policy,
    bookingContext: input.bookingContext,
  });

  let returnSide = evaluateReturnBookingRules({
    organizationId: input.organizationId,
    station: input.returnStation,
    returnAt,
    vehicle: input.vehicle,
    policy,
    bookingContext: input.bookingContext,
  });

  if (oneWayMismatch) {
    pickup = applyOneWayMismatch(pickup);
    returnSide = applyOneWayMismatch(returnSide);
  }

  return {
    version: STATION_BOOKING_RULES_VERSION,
    evaluatedAt,
    bookingType: input.bookingType,
    derivedIsOneWay,
    pickup,
    return: returnSide,
    manualOverrideRequired: false,
    manualOverrideApplied: false,
    manualOverrideAudit: null,
  };
}

export function getStationBookingRulesMetadata() {
  return {
    version: STATION_BOOKING_RULES_VERSION,
    contract: 'station-booking-rules',
  };
}
