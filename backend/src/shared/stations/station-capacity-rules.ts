import {
  evaluateStationCapacityPolicy,
  StationCapacityStatus,
  type StationCapacityBookingProjection,
  type StationCapacityPolicyInput,
  type StationCapacityPolicyResult,
  type StationCapacityVehicleSnapshot,
} from './station-capacity-policy';
import {
  StationCapacityRuleReasonCode,
  StationCapacityRuleSeverity,
  type StationCapacityRulesPolicy,
} from './station-capacity-rules.contract';

export {
  toStationCapacityRulesPolicy,
  type StationCapacityRulesPolicy,
} from './station-capacity-rules.contract';
import { StationBookingRuleOutcome } from './station-booking-rules.contract';

export interface StationCapacityRuleEvaluation {
  ruleId: string;
  severity: StationCapacityRuleSeverity;
  outcome: StationBookingRuleOutcome;
  reasonCode: StationCapacityRuleReasonCode | string;
  message: string;
  capacityStatus: StationCapacityStatus;
  capacity: StationCapacityPolicyResult;
}

export interface EvaluateStationCapacityRulesInput {
  capacityInput: StationCapacityPolicyInput;
  policy: StationCapacityRulesPolicy;
  ruleIdPrefix: string;
}

function resolveFullOutcome(
  policy: StationCapacityRulesPolicy,
): StationBookingRuleOutcome {
  if (policy.capacityBlockAtFull) {
    return StationBookingRuleOutcome.BLOCKED;
  }
  return policy.capacityFullOutcome;
}

function resolveProjectedOverOutcome(
  policy: StationCapacityRulesPolicy,
): StationBookingRuleOutcome {
  if (policy.capacityBlockAtFull) {
    return StationBookingRuleOutcome.BLOCKED;
  }
  return policy.capacityProjectedOverOutcome;
}

export function evaluateStationCapacityRules(
  input: EvaluateStationCapacityRulesInput,
): StationCapacityRuleEvaluation[] {
  const capacity = evaluateStationCapacityPolicy(input.capacityInput);
  const evaluations: StationCapacityRuleEvaluation[] = [];
  const prefix = input.ruleIdPrefix;

  if (capacity.configuredCapacity == null) {
    return evaluations;
  }

  const push = (
    ruleId: string,
    severity: StationCapacityRuleSeverity,
    outcome: StationBookingRuleOutcome,
    reasonCode: StationCapacityRuleReasonCode,
    message: string,
  ) => {
    evaluations.push({
      ruleId,
      severity,
      outcome,
      reasonCode,
      message,
      capacityStatus: capacity.capacityStatus,
      capacity,
    });
  };

  if (capacity.capacityStatus === StationCapacityStatus.PROJECTED_OVER_CAPACITY) {
    const outcome = resolveProjectedOverOutcome(input.policy);
    push(
      `${prefix}.capacity_projected_over`,
      outcome === StationBookingRuleOutcome.BLOCKED
        ? StationCapacityRuleSeverity.BLOCKED
        : StationCapacityRuleSeverity.MANUAL_CONFIRMATION_REQUIRED,
      outcome,
      StationCapacityRuleReasonCode.CAPACITY_PROJECTED_OVER,
      `Projected station occupancy exceeds configured capacity (${capacity.projectedOccupancy}/${capacity.configuredCapacity}).`,
    );
    return evaluations;
  }

  if (
    input.policy.capacityWarningEnabled &&
    capacity.capacityStatus === StationCapacityStatus.NEAR_CAPACITY
  ) {
    push(
      `${prefix}.capacity_warning`,
      StationCapacityRuleSeverity.WARNING,
      StationBookingRuleOutcome.WARNING,
      StationCapacityRuleReasonCode.CAPACITY_WARNING,
      `Station capacity is elevated (${capacity.capacityStatus}).`,
    );
  }

  if (
    capacity.capacityStatus === StationCapacityStatus.FULL ||
    capacity.capacityStatus === StationCapacityStatus.OVER_CAPACITY
  ) {
    const outcome = resolveFullOutcome(input.policy);
    const reasonCode =
      capacity.capacityStatus === StationCapacityStatus.OVER_CAPACITY
        ? StationCapacityRuleReasonCode.CAPACITY_OVER
        : StationCapacityRuleReasonCode.CAPACITY_FULL;
    push(
      `${prefix}.capacity_full`,
      outcome === StationBookingRuleOutcome.BLOCKED
        ? StationCapacityRuleSeverity.BLOCKED
        : StationCapacityRuleSeverity.MANUAL_CONFIRMATION_REQUIRED,
      outcome,
      reasonCode,
      `Station capacity is at or above limit (${capacity.capacityStatus}).`,
    );
  }

  return evaluations;
}

export function buildCapacityPolicyInput(input: {
  stationId: string;
  configuredCapacity: number | null;
  vehicles: StationCapacityVehicleSnapshot[];
  bookingProjection?: StationCapacityBookingProjection;
}): StationCapacityPolicyInput {
  return {
    stationId: input.stationId,
    configuredCapacity: input.configuredCapacity,
    vehicles: input.vehicles,
    bookingProjection: input.bookingProjection,
  };
}

export function mergeCapacityBookingProjection(
  base: StationCapacityBookingProjection | null | undefined,
  delta: StationCapacityBookingProjection,
): StationCapacityBookingProjection {
  const addNullable = (
    left: number | null | undefined,
    right: number | null | undefined,
  ): number | null => {
    if (left == null && right == null) return null;
    return (left ?? 0) + (right ?? 0);
  };

  const addConcurrent = (
    left: number | null | undefined,
    right: number | null | undefined,
  ): number => (left ?? 0) + (right ?? 0);

  return {
    expectedReturnArrivals: addNullable(base?.expectedReturnArrivals, delta.expectedReturnArrivals),
    expectedPickupDepartures: addNullable(
      base?.expectedPickupDepartures,
      delta.expectedPickupDepartures,
    ),
    concurrentReturnArrivals: addConcurrent(
      base?.concurrentReturnArrivals,
      delta.concurrentReturnArrivals,
    ),
    concurrentPickupDepartures: addConcurrent(
      base?.concurrentPickupDepartures,
      delta.concurrentPickupDepartures,
    ),
    concurrentTransferArrivals: addConcurrent(
      base?.concurrentTransferArrivals,
      delta.concurrentTransferArrivals,
    ),
    concurrentTransferDepartures: addConcurrent(
      base?.concurrentTransferDepartures,
      delta.concurrentTransferDepartures,
    ),
  };
}

export function resolveEffectiveCapacityBookingProjection(
  projection: StationCapacityBookingProjection | null | undefined,
  side: 'pickup' | 'return',
  includeCurrentVehicle: boolean,
): StationCapacityBookingProjection {
  const concurrentReturns =
    (projection?.expectedReturnArrivals ?? 0) + (projection?.concurrentReturnArrivals ?? 0);
  const concurrentPickups =
    (projection?.expectedPickupDepartures ?? 0) +
    (projection?.concurrentPickupDepartures ?? 0);
  const concurrentTransferArrivals = projection?.concurrentTransferArrivals ?? 0;
  const concurrentTransferDepartures = projection?.concurrentTransferDepartures ?? 0;

  if (side === 'pickup') {
    const departures = concurrentPickups + (includeCurrentVehicle ? 1 : 0);
    return {
      expectedPickupDepartures: departures,
      expectedReturnArrivals:
        concurrentReturns > 0 || projection?.expectedReturnArrivals != null
          ? concurrentReturns
          : null,
      concurrentTransferArrivals,
      concurrentTransferDepartures,
    };
  }

  const arrivals = concurrentReturns + (includeCurrentVehicle ? 1 : 0);
  return {
    expectedReturnArrivals: arrivals,
    expectedPickupDepartures:
      concurrentPickups > 0 || projection?.expectedPickupDepartures != null
        ? concurrentPickups
        : null,
    concurrentTransferArrivals,
    concurrentTransferDepartures,
  };
}

export function mapCapacityEvaluationsToBookingOutcomes(
  evaluations: StationCapacityRuleEvaluation[],
  field: 'pickup' | 'return',
  stationId: string,
) {
  return evaluations.map((evaluation) => ({
    ruleId: evaluation.ruleId,
    outcome: evaluation.outcome,
    field,
    stationId,
    reason: {
      code:
        evaluation.outcome === StationBookingRuleOutcome.BLOCKED
          ? 'CAPACITY_BLOCK'
          : evaluation.outcome === StationBookingRuleOutcome.WARNING
            ? 'CAPACITY_WARNING'
            : 'CAPACITY_MANUAL_CONFIRMATION',
      message: evaluation.message,
    },
  }));
}

export function mapCapacitySeverityToTransferIssues(
  evaluations: StationCapacityRuleEvaluation[],
): {
  warnings: Array<{ code: string; message: string }>;
  blockingReasons: Array<{ code: string; message: string }>;
} {
  const warnings: Array<{ code: string; message: string }> = [];
  const blockingReasons: Array<{ code: string; message: string }> = [];

  for (const evaluation of evaluations) {
    const issue = { code: String(evaluation.reasonCode), message: evaluation.message };
    if (evaluation.severity === StationCapacityRuleSeverity.BLOCKED) {
      blockingReasons.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  return { warnings, blockingReasons };
}
