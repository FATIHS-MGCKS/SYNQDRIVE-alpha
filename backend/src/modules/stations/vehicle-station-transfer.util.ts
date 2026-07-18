import type { VehicleStationTransferStatus } from '@prisma/client';
import {
  evaluateClearExpectedStationPolicy,
  evaluateSetExpectedStationPolicy,
  ExpectedStationClearReason,
  ExpectedStationOrigin,
  ExpectedStationRequestChannel,
} from '@shared/stations/expected-station.policy';
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
}): {
  allowed: boolean;
  blockingReasons: VehicleStationTransferIssue[];
} {
  const blockingReasons: VehicleStationTransferIssue[] = [];

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

  return {
    allowed: blockingReasons.length === 0,
    blockingReasons,
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
