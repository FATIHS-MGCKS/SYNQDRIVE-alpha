import type { RentalFleetVehicleDto } from './rental-rules.types';

export interface CategoryAssignmentDeltaInput {
  vehiclesToAdd?: string[];
  vehiclesToRemove?: string[];
  vehiclesToMove?: Array<{ vehicleId: string; fromCategoryId: string }>;
}

export function buildCategoryAssignmentDelta(
  initialAssignedIds: string[],
  selectedIds: string[],
  fleetVehicles: RentalFleetVehicleDto[],
  categoryId: string,
): CategoryAssignmentDeltaInput {
  const initial = new Set(initialAssignedIds);
  const selected = new Set(selectedIds);
  const fleetById = new Map(fleetVehicles.map((vehicle) => [vehicle.id, vehicle]));

  const vehiclesToAdd: string[] = [];
  const vehiclesToRemove: string[] = [];
  const vehiclesToMove: Array<{ vehicleId: string; fromCategoryId: string }> = [];

  for (const id of selected) {
    if (initial.has(id)) continue;
    const vehicle = fleetById.get(id);
    if (!vehicle) continue;
    if (vehicle.rentalCategoryId && vehicle.rentalCategoryId !== categoryId) {
      vehiclesToMove.push({ vehicleId: id, fromCategoryId: vehicle.rentalCategoryId });
    } else {
      vehiclesToAdd.push(id);
    }
  }

  for (const id of initialAssignedIds) {
    if (!selected.has(id)) {
      vehiclesToRemove.push(id);
    }
  }

  return { vehiclesToAdd, vehiclesToRemove, vehiclesToMove };
}

export function buildSingleVehicleCategoryDelta(input: {
  vehicleId: string;
  currentCategoryId: string | null;
  targetCategoryId: string;
}): CategoryAssignmentDeltaInput {
  const { vehicleId, currentCategoryId, targetCategoryId } = input;
  if (currentCategoryId === targetCategoryId) {
    return {};
  }
  if (currentCategoryId) {
    return {
      vehiclesToMove: [{ vehicleId, fromCategoryId: currentCategoryId }],
    };
  }
  return { vehiclesToAdd: [vehicleId] };
}
