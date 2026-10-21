import {
  evaluateBillableVehiclePolicy,
  type BillableVehiclePolicyContext,
  type BillableVehiclePolicyVehicle,
} from './billable-vehicle-policy';

/**
 * Determines whether a vehicle was billable immediately before a registry OFFBOARDED
 * transition at `occurredAt`, without using post-transition registry lifecycle state.
 */
export function wasVehicleBillableAtOffboardBoundary(
  context: BillableVehiclePolicyContext,
  vehicleId: string,
): boolean {
  const vehicle = context.vehicles.find((row) => row.id === vehicleId);
  if (!vehicle) {
    return false;
  }

  const preTransitionVehicle: BillableVehiclePolicyVehicle = {
    ...vehicle,
    registryLifecycle: 'ACTIVE',
  };

  const scopedContext: BillableVehiclePolicyContext = {
    ...context,
    vehicles: [preTransitionVehicle],
  };

  const result = evaluateBillableVehiclePolicy(scopedContext);
  return result.billableVehicles.some((row) => row.id === vehicleId);
}
