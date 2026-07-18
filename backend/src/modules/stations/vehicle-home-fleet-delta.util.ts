import type { StationStatus, VehicleStatus } from '@prisma/client';
import { SELECTABLE_STATION_STATUSES } from './station.types';
import {
  VehicleHomeFleetDeltaIssueCode,
  VehicleHomeFleetDeltaItemOutcome,
  type VehicleHomeFleetDeltaIssue,
  type VehicleHomeFleetDeltaItemResult,
} from './vehicle-home-fleet-delta.types';

export type HomeFleetDeltaOperation = 'add' | 'remove' | 'move';

function issue(code: string, message: string): VehicleHomeFleetDeltaIssue {
  return { code, message };
}

export function buildHomeFleetVehicleIdempotencyKey(input: {
  operation: HomeFleetDeltaOperation;
  organizationId: string;
  stationId: string;
  vehicleId: string;
  targetStationId?: string | null;
  batchIdempotencyKey?: string | null;
}): string {
  const scope = [
    'home-fleet',
    input.operation,
    input.organizationId,
    input.stationId,
    input.vehicleId,
  ];
  if (input.operation === 'move' && input.targetStationId) {
    scope.push('to', input.targetStationId);
  }
  if (input.batchIdempotencyKey) {
    return `${input.batchIdempotencyKey}:${input.vehicleId}`;
  }
  return scope.join(':');
}

export function assertHomeFleetTargetStationAssignable(
  station: { id: string; status: StationStatus; name: string },
): VehicleHomeFleetDeltaIssue | null {
  if (station.status === 'ARCHIVED') {
    return issue(
      VehicleHomeFleetDeltaIssueCode.STATION_ARCHIVED,
      `Station "${station.name}" is archived and cannot be used as a home target.`,
    );
  }
  if (!SELECTABLE_STATION_STATUSES.includes(station.status)) {
    return issue(
      VehicleHomeFleetDeltaIssueCode.STATION_INACTIVE,
      `Station "${station.name}" is not active and cannot be used as a home target.`,
    );
  }
  return null;
}

export function evaluateAddVehicleToHomeStation(input: {
  vehicleId: string;
  homeStationId: string | null;
  targetStationId: string;
  vehicleStatus: VehicleStatus;
}): Pick<VehicleHomeFleetDeltaItemResult, 'outcome' | 'warnings' | 'error'> & {
  nextHomeStationId: string | null;
} {
  const warnings: VehicleHomeFleetDeltaIssue[] = [];

  if (input.homeStationId === input.targetStationId) {
    return {
      outcome: VehicleHomeFleetDeltaItemOutcome.IDEMPOTENT,
      warnings,
      error: null,
      nextHomeStationId: input.homeStationId,
    };
  }

  if (input.vehicleStatus === 'RENTED') {
    warnings.push(
      issue(
        VehicleHomeFleetDeltaIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING,
        'Vehicle is currently rented; home station change is allowed but may affect operational planning.',
      ),
    );
  }

  return {
    outcome: VehicleHomeFleetDeltaItemOutcome.APPLIED,
    warnings,
    error: null,
    nextHomeStationId: input.targetStationId,
  };
}

export function evaluateRemoveVehicleFromHomeStation(input: {
  sourceStationId: string;
  homeStationId: string | null;
  vehicleStatus: VehicleStatus;
}): Pick<VehicleHomeFleetDeltaItemResult, 'outcome' | 'warnings' | 'error'> & {
  nextHomeStationId: string | null;
} {
  const warnings: VehicleHomeFleetDeltaIssue[] = [];

  if (input.homeStationId === null) {
    return {
      outcome: VehicleHomeFleetDeltaItemOutcome.IDEMPOTENT,
      warnings,
      error: null,
      nextHomeStationId: null,
    };
  }

  if (input.homeStationId !== input.sourceStationId) {
    return {
      outcome: VehicleHomeFleetDeltaItemOutcome.FAILED,
      warnings,
      error: issue(
        VehicleHomeFleetDeltaIssueCode.NOT_AT_SOURCE_STATION,
        'Vehicle is not assigned to this station home fleet.',
      ),
      nextHomeStationId: input.homeStationId,
    };
  }

  if (input.vehicleStatus === 'RENTED') {
    warnings.push(
      issue(
        VehicleHomeFleetDeltaIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING,
        'Vehicle is currently rented; home station change is allowed but may affect operational planning.',
      ),
    );
  }

  return {
    outcome: VehicleHomeFleetDeltaItemOutcome.APPLIED,
    warnings,
    error: null,
    nextHomeStationId: null,
  };
}

export function evaluateMoveVehicleToHomeStation(input: {
  sourceStationId: string;
  targetStationId: string;
  homeStationId: string | null;
  vehicleStatus: VehicleStatus;
}): Pick<VehicleHomeFleetDeltaItemResult, 'outcome' | 'warnings' | 'error'> & {
  nextHomeStationId: string | null;
} {
  if (input.sourceStationId === input.targetStationId) {
    return {
      outcome: VehicleHomeFleetDeltaItemOutcome.FAILED,
      warnings: [],
      error: issue(
        VehicleHomeFleetDeltaIssueCode.TARGET_SAME_AS_SOURCE,
        'Source and target station must differ for move.',
      ),
      nextHomeStationId: input.homeStationId,
    };
  }

  if (input.homeStationId === input.targetStationId) {
    return {
      outcome: VehicleHomeFleetDeltaItemOutcome.IDEMPOTENT,
      warnings: [],
      error: null,
      nextHomeStationId: input.homeStationId,
    };
  }

  if (input.homeStationId !== input.sourceStationId) {
    return {
      outcome: VehicleHomeFleetDeltaItemOutcome.FAILED,
      warnings: [],
      error: issue(
        VehicleHomeFleetDeltaIssueCode.NOT_AT_SOURCE_STATION,
        'Vehicle is not assigned to the source station home fleet.',
      ),
      nextHomeStationId: input.homeStationId,
    };
  }

  const warnings: VehicleHomeFleetDeltaIssue[] = [];
  if (input.vehicleStatus === 'RENTED') {
    warnings.push(
      issue(
        VehicleHomeFleetDeltaIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING,
        'Vehicle is currently rented; home station change is allowed but may affect operational planning.',
      ),
    );
  }

  return {
    outcome: VehicleHomeFleetDeltaItemOutcome.APPLIED,
    warnings,
    error: null,
    nextHomeStationId: input.targetStationId,
  };
}
