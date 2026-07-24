import type { VehicleData } from '../data/vehicles';
import { deriveVehicleDetailHeaderCleaningStatus } from './vehicle-cleaning-status-mutation';
import { deriveVehicleDetailHeaderEditStatus } from './vehicle-detail-header-status';
import type { VehicleCleaningUiStatus } from './vehicle-cleaning-status-mutation';
import type { VehicleOperationalUiStatus } from './vehicle-detail-header-status';

/**
 * Resolve the selected vehicle row from the latest fleet-map query snapshot.
 * Identity is stable via `selectedVehicleId`; metadata always comes from the
 * current fleet list — never from a copied object snapshot.
 */
export function deriveSelectedVehicleFromFleet(
  fleetVehicles: readonly VehicleData[],
  selectedVehicleId: string | null | undefined,
): VehicleData | null {
  if (!selectedVehicleId) return null;
  return fleetVehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
}

export interface VehicleDetailHeaderDraft {
  operationalStatus: VehicleOperationalUiStatus;
  cleaningStatus: VehicleCleaningUiStatus;
  station: string;
}

/** Header draft values derived from a confirmed fleet row. */
export function deriveVehicleDetailHeaderDraft(
  vehicle: VehicleData,
): VehicleDetailHeaderDraft {
  return {
    operationalStatus: deriveVehicleDetailHeaderEditStatus(vehicle),
    cleaningStatus: deriveVehicleDetailHeaderCleaningStatus(vehicle),
    station: vehicle.station,
  };
}

export interface VehicleDetailHeaderSyncFlags {
  vehicleStatusBusy: boolean;
  cleaningStatusBusy: boolean;
}

/**
 * Merge confirmed fleet header fields into local draft state.
 * Skips fields that are mid-mutation so optimistic UI is not overwritten.
 */
export function mergeVehicleDetailHeaderDraft(
  vehicle: VehicleData,
  flags: VehicleDetailHeaderSyncFlags,
): Partial<VehicleDetailHeaderDraft> {
  const draft = deriveVehicleDetailHeaderDraft(vehicle);
  const next: Partial<VehicleDetailHeaderDraft> = { station: draft.station };
  if (!flags.vehicleStatusBusy) {
    next.operationalStatus = draft.operationalStatus;
  }
  if (!flags.cleaningStatusBusy) {
    next.cleaningStatus = draft.cleaningStatus;
  }
  return next;
}

export interface SelectedVehicleUnavailableInput {
  selectedVehicleId: string | null | undefined;
  fleetVehicles: readonly VehicleData[];
  fleetLoading: boolean;
  fleetLastFetchedAt: number | null;
}

/** True when fleet has loaded and the bound vehicle id is no longer accessible. */
export function shouldHandleSelectedVehicleUnavailable(
  input: SelectedVehicleUnavailableInput,
): boolean {
  const { selectedVehicleId, fleetVehicles, fleetLoading, fleetLastFetchedAt } = input;
  if (!selectedVehicleId) return false;
  if (fleetLoading || fleetLastFetchedAt == null) return false;
  return !fleetVehicles.some((vehicle) => vehicle.id === selectedVehicleId);
}

/** Org changes must drop vehicle-detail binding — tenant data must not bleed across orgs. */
export function shouldClearVehicleDetailSelectionOnOrgChange(
  previousOrgId: string | null | undefined,
  nextOrgId: string | null | undefined,
): boolean {
  if (!nextOrgId) return true;
  if (!previousOrgId) return false;
  return previousOrgId !== nextOrgId;
}
