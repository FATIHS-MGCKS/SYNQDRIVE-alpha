import { api } from '../../lib/api';

export type StationHomeFleetVehicleRow = {
  id: string;
  homeStationId: string | null;
  stationPositionVersion: number;
};

export type StationHomeFleetApplyResult = {
  attached: number;
  detached: number;
  warnings: string[];
};

export async function applyStationHomeFleetSelection(input: {
  orgId: string;
  stationId: string;
  vehicles: StationHomeFleetVehicleRow[];
  selectedIds: Set<string>;
  reason?: string;
}): Promise<StationHomeFleetApplyResult> {
  const warnings: string[] = [];
  let attached = 0;
  let detached = 0;

  for (const vehicle of input.vehicles) {
    const wasHere = vehicle.homeStationId === input.stationId;
    const willBeHere = input.selectedIds.has(vehicle.id);

    if (wasHere === willBeHere) {
      continue;
    }

    const result = await api.stations.changeHomeStation(input.orgId, {
      vehicleId: vehicle.id,
      newHomeStationId: willBeHere ? input.stationId : null,
      expectedVersion: vehicle.stationPositionVersion ?? 0,
      reason: input.reason,
    });

    for (const warning of result.warnings ?? []) {
      warnings.push(warning.message);
    }

    if (willBeHere) {
      attached += 1;
    } else {
      detached += 1;
    }
  }

  return { attached, detached, warnings };
}
