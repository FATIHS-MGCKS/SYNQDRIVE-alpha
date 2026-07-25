import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../../rental/components/StatInlineDetail';
import {
  buildVehicleRuntimeStates,
  type BuildVehicleRuntimeStatesInput,
} from '../../rental/components/dashboard/runtime/vehicleRuntimeStateBuilder';
import type { VehicleRuntimeState } from '../../rental/components/dashboard/runtime/dashboardRuntimeTypes';

export interface BuildOperatorVehicleRuntimeInput {
  vehicle: VehicleData;
  health?: VehicleHealthResponse | null;
  healthMap?: Map<string, VehicleHealthResponse>;
  pickupItems?: PickupTileItem[];
  returnItems?: ReturnTileItem[];
  locale?: string;
  now?: Date;
}

function resolveHealthMap(
  vehicle: VehicleData,
  health?: VehicleHealthResponse | null,
  healthMap?: Map<string, VehicleHealthResponse>,
): Map<string, VehicleHealthResponse> {
  if (healthMap) return healthMap;
  const map = new Map<string, VehicleHealthResponse>();
  if (health) map.set(vehicle.id, health);
  return map;
}

/** Single-vehicle wrapper around the canonical dashboard runtime builder. */
export function buildOperatorVehicleRuntimeState(
  input: BuildOperatorVehicleRuntimeInput,
): VehicleRuntimeState {
  const map = resolveHealthMap(input.vehicle, input.health, input.healthMap);
  const blockedVehicleIds = new Set<string>();
  const health = map.get(input.vehicle.id);
  if (health?.rental_blocked) blockedVehicleIds.add(input.vehicle.id);

  const builderInput: BuildVehicleRuntimeStatesInput = {
    fleetVehicles: [input.vehicle],
    healthMap: map,
    blockedVehicleIds,
    pickupItems: input.pickupItems ?? [],
    returnItems: input.returnItems ?? [],
    locale: input.locale ?? 'de',
    now: input.now ?? new Date(),
  };

  const [state] = buildVehicleRuntimeStates(builderInput);
  if (!state) {
    throw new Error(`Missing runtime state for vehicle ${input.vehicle.id}`);
  }
  return state;
}

export function runtimeHasOpenCleaningReason(runtime: VehicleRuntimeState): boolean {
  return runtime.notReadyReasons.some((reason) => reason.category === 'cleaning');
}

export function runtimeHealthAttentionReasons(runtime: VehicleRuntimeState) {
  return [...runtime.criticalReasons, ...runtime.warningReasons].filter((reason) =>
    ['health', 'tires', 'brakes', 'battery', 'dtc', 'damage', 'complaints'].includes(
      reason.category,
    ),
  );
}

export function runtimeContradictionMessages(runtime: VehicleRuntimeState): string[] {
  return runtime.notReadyReasons
    .filter((reason) => reason.category === 'data_quality' || reason.source?.includes('diagnostic'))
    .map((reason) => reason.title);
}
