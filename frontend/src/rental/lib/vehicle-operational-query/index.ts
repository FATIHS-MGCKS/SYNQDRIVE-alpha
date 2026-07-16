export { vehicleOperationalQueryKeys, queryKeyMatches, isVehicleDetailKey } from './keys';
export type { VehicleOperationalQueryKey } from './keys';

export type {
  InvalidateVehicleOperationalStateInput,
  VehicleOperationalBookingContext,
  VehicleOperationalInvalidationContext,
  VehicleOperationalInvalidationReason,
  VehicleOperationalOptimisticKind,
  FleetOperationalOptimisticPatch,
} from './types';

export {
  derivePickupOptimisticPatch,
  deriveReturnOptimisticPatch,
  deriveReserveOptimisticPatch,
  deriveReleaseOptimisticPatch,
  deriveOptimisticPatches,
} from './optimistic';

export {
  registerVehicleOperationalInvalidationHandler,
  resetVehicleOperationalInvalidationHandlers,
} from './registry';

export {
  invalidateVehicleOperationalState,
  invalidateVehicleOperationalAfterBookingChange,
  VEHICLE_OPERATIONAL_INVALIDATED_EVENT,
} from './invalidate';
export type { VehicleOperationalInvalidatedDetail } from './invalidate';
