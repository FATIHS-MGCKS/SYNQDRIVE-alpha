import type { StationStatus } from '@prisma/client';
import { assertHomeFleetTargetStationAssignable } from './vehicle-home-fleet-delta.util';
import { VehicleHomeFleetDeltaIssueCode } from './vehicle-home-fleet-delta.types';
import {
  HomeAssignmentExecutableCommand,
  HomeAssignmentPreviewAction,
  HomeAssignmentPreviewIssueCode,
  type HomeAssignmentPreviewActiveTransfer,
  type HomeAssignmentPreviewIssue,
  type HomeAssignmentPreviewItem,
  type HomeAssignmentPreviewProposal,
  type HomeAssignmentPreviewStationRef,
  type HomeAssignmentPreviewSummary,
  type HomeAssignmentPreviewVehicleRow,
} from './vehicle-home-assignment-preview.types';

type StationLookup = Map<string, { id: string; name: string; status: StationStatus }>;

function issue(code: string, message: string): HomeAssignmentPreviewIssue {
  return { code, message };
}

function toStationRef(
  stationId: string | null,
  stations: StationLookup,
): HomeAssignmentPreviewStationRef | null {
  if (!stationId) return null;
  const station = stations.get(stationId);
  if (!station) return null;
  return { id: station.id, name: station.name, status: station.status };
}

function buildVehicleLabel(vehicle: HomeAssignmentPreviewVehicleRow): string | null {
  const parts = [vehicle.make, vehicle.model].filter((part) => !!part?.trim());
  return parts.length > 0 ? parts.join(' ') : null;
}

function resolveActiveTransfer(
  vehicle: HomeAssignmentPreviewVehicleRow,
  stations: StationLookup,
): HomeAssignmentPreviewActiveTransfer | null {
  if (!vehicle.expectedStationId) return null;
  if (vehicle.expectedStationId === vehicle.currentStationId) return null;

  const toStation = stations.get(vehicle.expectedStationId);
  if (!toStation) {
    return {
      fromStationId: vehicle.currentStationId,
      toStationId: vehicle.expectedStationId,
      fromStationName: vehicle.currentStationId
        ? stations.get(vehicle.currentStationId)?.name ?? null
        : null,
      toStationName: vehicle.expectedStationId,
    };
  }

  return {
    fromStationId: vehicle.currentStationId,
    toStationId: toStation.id,
    fromStationName: vehicle.currentStationId
      ? stations.get(vehicle.currentStationId)?.name ?? null
      : null,
    toStationName: toStation.name,
  };
}

function classifySummaryBucket(
  contextStationId: string,
  currentHomeStationId: string | null,
  desiredHomeStationId: string | null,
  action: HomeAssignmentPreviewAction,
): keyof Pick<
  HomeAssignmentPreviewSummary,
  'toAdd' | 'toRemove' | 'toMove' | 'unchanged' | 'blocked'
> | null {
  if (action === HomeAssignmentPreviewAction.BLOCKED) return 'blocked';
  if (action === HomeAssignmentPreviewAction.UNCHANGED) return 'unchanged';

  if (action === HomeAssignmentPreviewAction.REMOVE) return 'toRemove';
  if (action === HomeAssignmentPreviewAction.ADD) return 'toAdd';
  if (action === HomeAssignmentPreviewAction.MOVE) {
    if (
      desiredHomeStationId === contextStationId &&
      currentHomeStationId !== contextStationId
    ) {
      return 'toAdd';
    }
    if (
      currentHomeStationId === contextStationId &&
      desiredHomeStationId !== contextStationId
    ) {
      return 'toRemove';
    }
    return 'toMove';
  }

  return null;
}

export function dedupeHomeAssignmentProposals(
  proposals: HomeAssignmentPreviewProposal[],
): { proposals: HomeAssignmentPreviewProposal[]; duplicateVehicleIdsIgnored: number } {
  const seen = new Set<string>();
  const deduped: HomeAssignmentPreviewProposal[] = [];
  let duplicateVehicleIdsIgnored = 0;

  for (const proposal of proposals) {
    if (seen.has(proposal.vehicleId)) {
      duplicateVehicleIdsIgnored += 1;
      continue;
    }
    seen.add(proposal.vehicleId);
    deduped.push(proposal);
  }

  return { proposals: deduped, duplicateVehicleIdsIgnored };
}

export function evaluateHomeAssignmentPreviewItem(input: {
  contextStationId: string;
  proposal: HomeAssignmentPreviewProposal;
  vehicle: HomeAssignmentPreviewVehicleRow | null;
  stations: StationLookup;
}): HomeAssignmentPreviewItem {
  const { contextStationId, proposal, vehicle, stations } = input;
  const conflicts: HomeAssignmentPreviewIssue[] = [];
  const warnings: HomeAssignmentPreviewIssue[] = [];

  if (!vehicle) {
    return {
      vehicleId: proposal.vehicleId,
      licensePlate: null,
      vehicleLabel: null,
      rentalStatus: 'AVAILABLE',
      currentHomeStation: null,
      desiredHomeStation: toStationRef(proposal.desiredHomeStationId, stations),
      currentPhysicalStation: null,
      expectedStation: null,
      activeTransfer: null,
      action: HomeAssignmentPreviewAction.BLOCKED,
      executableCommand: null,
      moveFromStationId: null,
      moveToStationId: null,
      conflicts: [
        issue(
          HomeAssignmentPreviewIssueCode.VEHICLE_NOT_FOUND,
          'Vehicle does not belong to this organization.',
        ),
      ],
      warnings,
    };
  }

  const currentHomeStationId = vehicle.homeStationId;
  const desiredHomeStationId = proposal.desiredHomeStationId;
  const activeTransfer = resolveActiveTransfer(vehicle, stations);

  if (activeTransfer) {
    warnings.push(
      issue(
        HomeAssignmentPreviewIssueCode.ACTIVE_TRANSFER_WARNING,
        `Vehicle has an active transfer toward "${activeTransfer.toStationName}".`,
      ),
    );
  }

  if (vehicle.status === 'RENTED') {
    warnings.push(
      issue(
        HomeAssignmentPreviewIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING,
        'Vehicle is currently rented; home station change may affect operational planning.',
      ),
    );
  }

  if (desiredHomeStationId) {
    const targetStation = stations.get(desiredHomeStationId);
    if (!targetStation) {
      conflicts.push(
        issue(
          HomeAssignmentPreviewIssueCode.STATION_NOT_FOUND,
          'Desired home station was not found in this organization.',
        ),
      );
    } else {
      const assignability = assertHomeFleetTargetStationAssignable(targetStation);
      if (assignability) {
        conflicts.push(assignability);
      }
    }
  }

  let action: HomeAssignmentPreviewAction = HomeAssignmentPreviewAction.UNCHANGED;
  let executableCommand: HomeAssignmentExecutableCommand | null = null;
  let moveFromStationId: string | null = null;
  let moveToStationId: string | null = null;

  if (currentHomeStationId === desiredHomeStationId) {
    action = HomeAssignmentPreviewAction.UNCHANGED;
  } else if (conflicts.length > 0) {
    action = HomeAssignmentPreviewAction.BLOCKED;
  } else if (desiredHomeStationId === null) {
    if (currentHomeStationId === null) {
      action = HomeAssignmentPreviewAction.UNCHANGED;
    } else if (currentHomeStationId !== contextStationId) {
      conflicts.push(
        issue(
          HomeAssignmentPreviewIssueCode.NOT_AT_SOURCE_STATION,
          'Vehicle is not assigned to this station home fleet.',
        ),
      );
      action = HomeAssignmentPreviewAction.BLOCKED;
    } else {
      action = HomeAssignmentPreviewAction.REMOVE;
      executableCommand = HomeAssignmentExecutableCommand.REMOVE;
    }
  } else if (currentHomeStationId === null) {
    action = HomeAssignmentPreviewAction.ADD;
    executableCommand = HomeAssignmentExecutableCommand.ADD;
    moveToStationId = desiredHomeStationId;
  } else if (currentHomeStationId === desiredHomeStationId) {
    action = HomeAssignmentPreviewAction.UNCHANGED;
  } else {
    action = HomeAssignmentPreviewAction.MOVE;
    executableCommand = HomeAssignmentExecutableCommand.MOVE;
    moveFromStationId = currentHomeStationId;
    moveToStationId = desiredHomeStationId;
  }

  if (conflicts.length > 0 && action !== HomeAssignmentPreviewAction.UNCHANGED) {
    action = HomeAssignmentPreviewAction.BLOCKED;
    executableCommand = null;
    moveFromStationId = null;
    moveToStationId = null;
  }

  return {
    vehicleId: vehicle.id,
    licensePlate: vehicle.licensePlate,
    vehicleLabel: buildVehicleLabel(vehicle),
    rentalStatus: vehicle.status,
    currentHomeStation: toStationRef(currentHomeStationId, stations),
    desiredHomeStation: toStationRef(desiredHomeStationId, stations),
    currentPhysicalStation: toStationRef(vehicle.currentStationId, stations),
    expectedStation: toStationRef(vehicle.expectedStationId, stations),
    activeTransfer,
    action,
    executableCommand,
    moveFromStationId,
    moveToStationId,
    conflicts,
    warnings,
  };
}

export function summarizeHomeAssignmentPreviewItems(
  contextStationId: string,
  items: HomeAssignmentPreviewItem[],
  requested: number,
  evaluated: number,
): HomeAssignmentPreviewSummary {
  const summary: HomeAssignmentPreviewSummary = {
    requested,
    evaluated,
    toAdd: 0,
    toRemove: 0,
    toMove: 0,
    unchanged: 0,
    blocked: 0,
  };

  for (const item of items) {
    const bucket = classifySummaryBucket(
      contextStationId,
      item.currentHomeStation?.id ?? null,
      item.desiredHomeStation?.id ?? null,
      item.action,
    );
    if (bucket) {
      summary[bucket] += 1;
    }
  }

  return summary;
}
