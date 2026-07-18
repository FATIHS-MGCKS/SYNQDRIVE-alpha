import type { StationStatus, VehicleStationPositionSource, VehicleStatus } from '@prisma/client';
import { SELECTABLE_STATION_STATUSES } from './station.types';
import {
  VehicleCorrectCurrentStationCommandIssueCode,
  VehicleCorrectCurrentStationCommandName,
  VehicleCorrectCurrentStationCommandOutcome,
  type VehicleCorrectCurrentStationCommandAuditData,
  type VehicleCorrectCurrentStationCommandEvaluation,
  type VehicleCorrectCurrentStationCommandIssue,
} from './vehicle-correct-current-station-command.types';

function issue(code: string, message: string): VehicleCorrectCurrentStationCommandIssue {
  return { code, message };
}

export function isSameCurrentStationAssignment(
  currentStationId: string | null,
  newCurrentStationId: string | null,
): boolean {
  return currentStationId === newCurrentStationId;
}

export function evaluateCorrectVehicleCurrentStationCommand(input: {
  currentStationId: string | null;
  newCurrentStationId: string | null;
  vehicleStatus: VehicleStatus;
  source: VehicleStationPositionSource;
  targetStationStatus?: StationStatus | null;
}): VehicleCorrectCurrentStationCommandEvaluation {
  const warnings: VehicleCorrectCurrentStationCommandIssue[] = [];
  const blockingReasons: VehicleCorrectCurrentStationCommandIssue[] = [];

  if (input.source !== 'MANUAL') {
    blockingReasons.push(
      issue(
        VehicleCorrectCurrentStationCommandIssueCode.INVALID_SOURCE,
        'Only MANUAL source is supported for CorrectVehicleCurrentStation.',
      ),
    );
  }

  const idempotent = isSameCurrentStationAssignment(
    input.currentStationId,
    input.newCurrentStationId,
  );

  if (input.newCurrentStationId && input.targetStationStatus) {
    if (input.targetStationStatus === 'ARCHIVED') {
      blockingReasons.push(
        issue(
          VehicleCorrectCurrentStationCommandIssueCode.TARGET_STATION_ARCHIVED,
          'Target station is archived and cannot be used as current location.',
        ),
      );
    } else if (!SELECTABLE_STATION_STATUSES.includes(input.targetStationStatus)) {
      blockingReasons.push(
        issue(
          VehicleCorrectCurrentStationCommandIssueCode.TARGET_STATION_INACTIVE,
          'Target station is not active and cannot be used as current location.',
        ),
      );
    }
  }

  if (input.vehicleStatus === 'RENTED' && !idempotent) {
    warnings.push(
      issue(
        VehicleCorrectCurrentStationCommandIssueCode.VEHICLE_RENTED_CURRENT_CORRECTION_WARNING,
        'Vehicle is currently rented; manual current-location correction is allowed but may affect operational planning.',
      ),
    );
  }

  if (idempotent) {
    return {
      outcome: VehicleCorrectCurrentStationCommandOutcome.IDEMPOTENT,
      allowed: true,
      idempotent: true,
      blockingReasons: [],
      warnings,
    };
  }

  const allowed = blockingReasons.length === 0;

  return {
    outcome: allowed
      ? VehicleCorrectCurrentStationCommandOutcome.APPLIED
      : VehicleCorrectCurrentStationCommandOutcome.BLOCKED,
    allowed,
    idempotent: false,
    blockingReasons,
    warnings,
  };
}

export function buildVehicleCorrectCurrentStationVersionConflictIssue(): VehicleCorrectCurrentStationCommandIssue {
  return issue(
    VehicleCorrectCurrentStationCommandIssueCode.STATION_POSITION_VERSION_CONFLICT,
    'Vehicle station position version conflict. Reload the vehicle and retry CorrectVehicleCurrentStation.',
  );
}

export function buildVehicleCorrectCurrentStationCommandAudit(
  input: {
    organizationId: string;
    vehicleId: string;
    fromCurrentStationId: string | null;
    toCurrentStationId: string | null;
    source: VehicleStationPositionSource;
    previousStationPositionVersion: number;
    nextStationPositionVersion: number;
    reason: string;
    performedByUserId?: string | null;
    idempotent: boolean;
  },
  performedAt: Date = new Date(),
): VehicleCorrectCurrentStationCommandAuditData {
  return {
    command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    fromCurrentStationId: input.fromCurrentStationId,
    toCurrentStationId: input.toCurrentStationId,
    source: input.source,
    previousStationPositionVersion: input.previousStationPositionVersion,
    nextStationPositionVersion: input.nextStationPositionVersion,
    reason: input.reason,
    performedAt: performedAt.toISOString(),
    performedByUserId: input.performedByUserId ?? null,
    idempotent: input.idempotent,
  };
}
