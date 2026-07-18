import type { VehicleStatus } from '@prisma/client';
import {
  VehicleChangeHomeStationCommandIssueCode,
  VehicleChangeHomeStationCommandName,
  VehicleChangeHomeStationCommandOutcome,
  type VehicleChangeHomeStationCommandAuditData,
  type VehicleChangeHomeStationCommandEvaluation,
  type VehicleChangeHomeStationCommandIssue,
} from './vehicle-change-home-station-command.types';

function issue(code: string, message: string): VehicleChangeHomeStationCommandIssue {
  return { code, message };
}

export function isSameHomeStationAssignment(
  currentHomeStationId: string | null,
  newHomeStationId: string | null,
): boolean {
  return currentHomeStationId === newHomeStationId;
}

export function evaluateChangeVehicleHomeStationCommand(input: {
  currentHomeStationId: string | null;
  newHomeStationId: string | null;
  vehicleStatus: VehicleStatus;
}): VehicleChangeHomeStationCommandEvaluation {
  const warnings: VehicleChangeHomeStationCommandIssue[] = [];
  const blockingReasons: VehicleChangeHomeStationCommandIssue[] = [];

  const idempotent = isSameHomeStationAssignment(
    input.currentHomeStationId,
    input.newHomeStationId,
  );

  if (input.vehicleStatus === 'RENTED') {
    warnings.push(
      issue(
        VehicleChangeHomeStationCommandIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING,
        'Vehicle is currently rented; home station change is allowed but may affect operational planning.',
      ),
    );
  }

  if (idempotent) {
    return {
      outcome: VehicleChangeHomeStationCommandOutcome.IDEMPOTENT,
      allowed: true,
      idempotent: true,
      blockingReasons: [],
      warnings,
    };
  }

  const allowed = blockingReasons.length === 0;

  return {
    outcome: allowed
      ? VehicleChangeHomeStationCommandOutcome.APPLIED
      : VehicleChangeHomeStationCommandOutcome.BLOCKED,
    allowed,
    idempotent: false,
    blockingReasons,
    warnings,
  };
}

export function buildVehicleChangeHomeStationVersionConflictIssue(): VehicleChangeHomeStationCommandIssue {
  return issue(
    VehicleChangeHomeStationCommandIssueCode.STATION_POSITION_VERSION_CONFLICT,
    'Vehicle station position version conflict. Reload the vehicle and retry ChangeVehicleHomeStation.',
  );
}

export function buildVehicleChangeHomeStationCommandAudit(input: {
  organizationId: string;
  vehicleId: string;
  fromHomeStationId: string | null;
  toHomeStationId: string | null;
  previousStationPositionVersion: number;
  nextStationPositionVersion: number;
  reason?: string | null;
  performedByUserId?: string | null;
  idempotent: boolean;
}, performedAt: Date = new Date()): VehicleChangeHomeStationCommandAuditData {
  return {
    command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    fromHomeStationId: input.fromHomeStationId,
    toHomeStationId: input.toHomeStationId,
    previousStationPositionVersion: input.previousStationPositionVersion,
    nextStationPositionVersion: input.nextStationPositionVersion,
    reason: input.reason ?? null,
    performedAt: performedAt.toISOString(),
    performedByUserId: input.performedByUserId ?? null,
    idempotent: input.idempotent,
  };
}
