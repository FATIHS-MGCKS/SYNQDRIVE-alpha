import type { VehicleStationTransferStatus } from '@prisma/client';
import {
  evaluateClearExpectedStationPolicy,
  evaluateSetExpectedStationPolicy,
  ExpectedStationClearReason,
  ExpectedStationOrigin,
  ExpectedStationRequestChannel,
} from '@shared/stations/expected-station.policy';
import {
  buildTransferPlanManualOverrideScope,
  mapTransferWarningsToOverrideEvaluations,
  validateStationRuleManualOverrideRequest,
} from '@shared/stations/station-rule-manual-override.policy';
import type { StationRuleManualOverrideInput } from '@shared/stations/station-rule-manual-override.contract';
import {
  evaluateStationCapacityRules,
  toStationCapacityRulesPolicy,
  type StationCapacityRulesPolicy,
} from '@shared/stations/station-capacity-rules';
import type {
  StationCapacityBookingProjection,
  StationCapacityVehicleSnapshot,
} from '@shared/stations/station-capacity-policy';
import {
  ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES,
  VehicleStationTransferCommandOutcome,
  VehicleStationTransferIssueCode,
  type VehicleStationTransferIssue,
  type VehicleStationTransferRecord,
} from './vehicle-station-transfer.types';

const TRANSITIONS: Record<VehicleStationTransferStatus, VehicleStationTransferStatus[]> = {
  PLANNED: ['READY', 'IN_TRANSIT', 'CANCELLED'],
  READY: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['ARRIVED', 'OVERDUE', 'CANCELLED'],
  OVERDUE: ['ARRIVED', 'CANCELLED'],
  ARRIVED: [],
  CANCELLED: [],
};

export function issue(code: string, message: string): VehicleStationTransferIssue {
  return { code, message };
}

export function isActiveVehicleStationTransferStatus(
  status: VehicleStationTransferStatus,
): boolean {
  return ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES.includes(status);
}

export function canTransitionVehicleStationTransfer(
  from: VehicleStationTransferStatus,
  to: VehicleStationTransferStatus,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function evaluatePlanVehicleStationTransfer(input: {
  fromStationId: string | null;
  toStationId: string;
  toStationStatus?: string | null;
  fromStationStatus?: string | null;
  activeTransferCount: number;
  vehicleExpectedStationId?: string | null;
  vehicleExpectedStationSource?: string | null;
  plannedAt: Date | string;
  expectedArrivalAt?: Date | string | null;
  organizationId: string;
  vehicleId: string;
  manualOverride?: StationRuleManualOverrideInput | null;
  overrideActorUserId?: string | null;
  destinationCapacity?: {
    configuredCapacity: number | null;
    vehicles: StationCapacityVehicleSnapshot[];
    concurrentProjection?: StationCapacityBookingProjection;
    policy?: Partial<StationCapacityRulesPolicy>;
  };
  sourceCapacity?: {
    configuredCapacity: number | null;
    vehicles: StationCapacityVehicleSnapshot[];
    concurrentProjection?: StationCapacityBookingProjection;
    policy?: Partial<StationCapacityRulesPolicy>;
  };
}): {
  allowed: boolean;
  blockingReasons: VehicleStationTransferIssue[];
  warnings: VehicleStationTransferIssue[];
  manualOverrideRequired: boolean;
  manualOverrideApplied: boolean;
} {
  const blockingReasons: VehicleStationTransferIssue[] = [];
  const warnings: VehicleStationTransferIssue[] = [];

  if (input.fromStationId && input.fromStationId === input.toStationId) {
    blockingReasons.push(
      issue(
        VehicleStationTransferIssueCode.SAME_FROM_TO_STATION,
        'Transfer source and destination station must differ.',
      ),
    );
  }

  if (input.activeTransferCount > 0) {
    blockingReasons.push(
      issue(
        VehicleStationTransferIssueCode.ACTIVE_TRANSFER_EXISTS,
        'Vehicle already has an active station transfer.',
      ),
    );
  }

  const setPolicy = evaluateSetExpectedStationPolicy({
    targetStationId: input.toStationId,
    origin: ExpectedStationOrigin.PLANNED_TRANSFER,
    sourceSetAt: input.plannedAt,
    context: { transferId: 'pending' },
    targetStationStatus: input.toStationStatus as never,
    existing:
      input.vehicleExpectedStationId && input.vehicleExpectedStationSource
        ? {
            expectedStationId: input.vehicleExpectedStationId,
            expectedStationSource: input.vehicleExpectedStationSource,
            expectedStationSetAt: input.plannedAt,
          }
        : null,
    requestChannel: ExpectedStationRequestChannel.COMMAND,
  });

  if (!setPolicy.allowed && !setPolicy.idempotent) {
    blockingReasons.push(
      issue(
        VehicleStationTransferIssueCode.EXPECTED_POLICY_BLOCKED,
        setPolicy.blockingReasons[0]?.message ??
          'Expected station policy blocked transfer planning.',
      ),
    );
  }

  if (input.destinationCapacity?.configuredCapacity != null) {
    const capacityPolicy = toStationCapacityRulesPolicy(input.destinationCapacity.policy);
    const destinationEvaluations = evaluateStationCapacityRules({
      ruleIdPrefix: 'transfer.destination',
      policy: capacityPolicy,
      capacityInput: {
        stationId: input.toStationId,
        configuredCapacity: input.destinationCapacity.configuredCapacity,
        vehicles: input.destinationCapacity.vehicles,
        bookingProjection: {
          ...(input.destinationCapacity.concurrentProjection ?? {}),
          concurrentTransferArrivals:
            (input.destinationCapacity.concurrentProjection?.concurrentTransferArrivals ?? 0) + 1,
        },
      },
    });

    for (const evaluation of destinationEvaluations) {
      if (evaluation.severity === 'BLOCKED') {
        blockingReasons.push(
          issue(VehicleStationTransferIssueCode.CAPACITY_BLOCKED, evaluation.message),
        );
      } else if (evaluation.severity === 'MANUAL_CONFIRMATION_REQUIRED') {
        warnings.push(
          issue(
            VehicleStationTransferIssueCode.CAPACITY_MANUAL_CONFIRMATION,
            evaluation.message,
          ),
        );
      } else {
        warnings.push(
          issue(VehicleStationTransferIssueCode.CAPACITY_WARNING, evaluation.message),
        );
      }
    }
  }

  if (input.sourceCapacity?.configuredCapacity != null && input.fromStationId) {
    const capacityPolicy = toStationCapacityRulesPolicy(input.sourceCapacity.policy);
    const sourceEvaluations = evaluateStationCapacityRules({
      ruleIdPrefix: 'transfer.source',
      policy: capacityPolicy,
      capacityInput: {
        stationId: input.fromStationId,
        configuredCapacity: input.sourceCapacity.configuredCapacity,
        vehicles: input.sourceCapacity.vehicles,
        bookingProjection: {
          ...(input.sourceCapacity.concurrentProjection ?? {}),
          concurrentTransferDepartures:
            (input.sourceCapacity.concurrentProjection?.concurrentTransferDepartures ?? 0) + 1,
        },
      },
    });

    for (const evaluation of sourceEvaluations) {
      if (evaluation.severity === 'BLOCKED') {
        blockingReasons.push(
          issue(VehicleStationTransferIssueCode.CAPACITY_BLOCKED, evaluation.message),
        );
      } else if (evaluation.severity === 'MANUAL_CONFIRMATION_REQUIRED') {
        warnings.push(
          issue(
            VehicleStationTransferIssueCode.CAPACITY_MANUAL_CONFIRMATION,
            evaluation.message,
          ),
        );
      } else {
        warnings.push(
          issue(VehicleStationTransferIssueCode.CAPACITY_WARNING, evaluation.message),
        );
      }
    }
  }

  const overrideScope = buildTransferPlanManualOverrideScope({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    fromStationId: input.fromStationId,
    toStationId: input.toStationId,
    plannedAt: input.plannedAt,
    expectedArrivalAt: input.expectedArrivalAt ?? null,
  });

  const overrideValidation = validateStationRuleManualOverrideRequest({
    manualOverride: input.manualOverride,
    actor: input.overrideActorUserId
      ? {
          userId: input.overrideActorUserId,
          permission: 'stations.override_rules',
        }
      : null,
    scope: overrideScope,
    evaluations: mapTransferWarningsToOverrideEvaluations(warnings),
  });

  const manualOverrideRequired = overrideValidation.issues.some(
    (issueEntry) => issueEntry.code === 'STATION_RULE_MANUAL_OVERRIDE_REQUIRED',
  );

  if (manualOverrideRequired && !input.manualOverride) {
    blockingReasons.push(
      issue(
        VehicleStationTransferIssueCode.MANUAL_OVERRIDE_REQUIRED,
        'Manual override with reason is required before planning this transfer.',
      ),
    );
  }

  if (input.manualOverride && !overrideValidation.valid) {
    blockingReasons.push(
      issue(
        VehicleStationTransferIssueCode.MANUAL_OVERRIDE_INVALID,
        overrideValidation.issues[0]?.message ?? 'Manual override is invalid.',
      ),
    );
  }

  return {
    allowed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    manualOverrideRequired: manualOverrideRequired && !input.manualOverride,
    manualOverrideApplied: Boolean(input.manualOverride && overrideValidation.valid),
  };
}

export function evaluateTransferTransition(input: {
  transfer: Pick<VehicleStationTransferRecord, 'status' | 'toStationId'>;
  targetStatus: VehicleStationTransferStatus;
  vehicle: {
    expectedStationId: string | null;
    expectedStationSource: string | null;
    currentStationId: string | null;
  };
  otherActiveTransferCount: number;
  performedAt: Date | string;
}): {
  allowed: boolean;
  idempotent: boolean;
  blockingReasons: VehicleStationTransferIssue[];
  shouldSetExpected: boolean;
  shouldClearExpected: boolean;
  shouldSetCurrent: boolean;
} {
  const blockingReasons: VehicleStationTransferIssue[] = [];

  if (input.transfer.status === input.targetStatus) {
    return {
      allowed: true,
      idempotent: true,
      blockingReasons: [],
      shouldSetExpected: false,
      shouldClearExpected: false,
      shouldSetCurrent: false,
    };
  }

  if (!canTransitionVehicleStationTransfer(input.transfer.status, input.targetStatus)) {
    blockingReasons.push(
      issue(
        VehicleStationTransferIssueCode.INVALID_TRANSITION,
        `Cannot transition transfer from ${input.transfer.status} to ${input.targetStatus}.`,
      ),
    );
    return {
      allowed: false,
      idempotent: false,
      blockingReasons,
      shouldSetExpected: false,
      shouldClearExpected: false,
      shouldSetCurrent: false,
    };
  }

  let shouldSetExpected = false;
  let shouldClearExpected = false;
  let shouldSetCurrent = false;

  if (input.targetStatus === 'PLANNED') {
    shouldSetExpected = true;
  }

  if (input.targetStatus === 'ARRIVED') {
    shouldSetCurrent = true;
    const clearPolicy = evaluateClearExpectedStationPolicy({
      clearReason: ExpectedStationClearReason.DESTINATION_REACHED,
      clearedAt: input.performedAt,
      expectedStationId: input.vehicle.expectedStationId,
      actualArrivalStationId: input.transfer.toStationId,
      currentStationId: input.transfer.toStationId,
      requestChannel: ExpectedStationRequestChannel.COMMAND,
    });
    if (!clearPolicy.allowed && input.vehicle.expectedStationId) {
      blockingReasons.push(
        issue(
          VehicleStationTransferIssueCode.CLEAR_POLICY_BLOCKED,
          clearPolicy.blockingReasons[0]?.message ??
            'Expected station cannot be cleared on transfer arrival.',
        ),
      );
    } else {
      shouldClearExpected = clearPolicy.allowed && !clearPolicy.idempotent;
    }
  }

  if (input.targetStatus === 'CANCELLED') {
    shouldClearExpected = shouldClearExpectedOnTransferCancel({
      vehicleExpectedStationId: input.vehicle.expectedStationId,
      vehicleExpectedStationSource: input.vehicle.expectedStationSource,
      transferToStationId: input.transfer.toStationId,
      otherActiveTransferCount: input.otherActiveTransferCount,
    });
  }

  return {
    allowed: blockingReasons.length === 0,
    idempotent: false,
    blockingReasons,
    shouldSetExpected,
    shouldClearExpected,
    shouldSetCurrent,
  };
}

export function shouldClearExpectedOnTransferCancel(input: {
  vehicleExpectedStationId: string | null;
  vehicleExpectedStationSource: string | null;
  transferToStationId: string;
  otherActiveTransferCount: number;
}): boolean {
  if (input.otherActiveTransferCount > 0) {
    return false;
  }
  if (!input.vehicleExpectedStationId) {
    return false;
  }
  if (input.vehicleExpectedStationId !== input.transferToStationId) {
    return false;
  }
  if (input.vehicleExpectedStationSource !== 'TRANSFER') {
    return false;
  }
  return true;
}

export function buildTransferCommandOutcome(
  allowed: boolean,
  idempotent: boolean,
): VehicleStationTransferCommandOutcome {
  if (idempotent) {
    return VehicleStationTransferCommandOutcome.IDEMPOTENT;
  }
  return allowed
    ? VehicleStationTransferCommandOutcome.APPLIED
    : VehicleStationTransferCommandOutcome.BLOCKED;
}

export function resolveTransitionTimestampFields(
  targetStatus: VehicleStationTransferStatus,
  performedAt: Date,
): {
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
} {
  switch (targetStatus) {
    case 'IN_TRANSIT':
      return { startedAt: performedAt };
    case 'ARRIVED':
      return { completedAt: performedAt };
    case 'CANCELLED':
      return { cancelledAt: performedAt };
    default:
      return {};
  }
}
