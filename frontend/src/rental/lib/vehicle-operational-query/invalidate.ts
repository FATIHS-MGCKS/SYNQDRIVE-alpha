import { useFleetMapStore } from '../../stores/useFleetMapStore';
import { vehicleOperationalQueryKeys } from './keys';
import { deriveOptimisticPatches } from './optimistic';
import {
  getHandlersForKeys,
  type VehicleOperationalInvalidationHandler,
} from './registry';
import type {
  InvalidateVehicleOperationalStateInput,
  VehicleOperationalInvalidationContext,
  VehicleOperationalInvalidationReason,
  VehicleOperationalOptimisticKind,
} from './types';

export const VEHICLE_OPERATIONAL_INVALIDATED_EVENT = 'vehicle-operational:invalidated';

export interface VehicleOperationalInvalidatedDetail {
  orgId: string;
  vehicleIds: string[];
  reason: VehicleOperationalInvalidationReason;
}

function uniqueVehicleIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

function defaultOptimisticForReason(
  reason: VehicleOperationalInvalidationReason,
): VehicleOperationalOptimisticKind {
  switch (reason) {
    case 'handover-pickup':
      return 'pickup';
    case 'handover-return':
      return 'return';
    case 'booking-created':
      return 'reserve';
    case 'booking-cancelled':
    case 'booking-no-show':
      return 'release';
    default:
      return 'none';
  }
}

function buildInvalidationKeys(
  orgId: string,
  vehicleIds: string[],
  reason: VehicleOperationalInvalidationReason,
): readonly (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = [
    vehicleOperationalQueryKeys.fleetMap(orgId),
    vehicleOperationalQueryKeys.fleetHealth(orgId),
  ];

  for (const vehicleId of vehicleIds) {
    if (vehicleId === '__org__') continue;
    keys.push(vehicleOperationalQueryKeys.vehicleDetail(orgId, vehicleId));
  }

  if (
    reason === 'handover-pickup' ||
    reason === 'handover-return' ||
    reason === 'booking-created' ||
    reason === 'booking-updated' ||
    reason === 'booking-cancelled' ||
    reason === 'booking-no-show'
  ) {
    keys.push(vehicleOperationalQueryKeys.dashboardTodayBookings(orgId));
    keys.push(vehicleOperationalQueryKeys.dashboardRuntime(orgId));
    keys.push(vehicleOperationalQueryKeys.operatorToday(orgId));
    keys.push(vehicleOperationalQueryKeys.operatorTasks(orgId));
  }

  if (
    reason === 'vehicle-status-patch' ||
    reason === 'maintenance-patch'
  ) {
    keys.push(vehicleOperationalQueryKeys.dashboardRuntime(orgId));
  }

  return keys;
}

/**
 * Targeted invalidation bus for vehicle operational state read models.
 * Never clears the full SPA cache — only registered handlers for matching keys.
 */
export async function invalidateVehicleOperationalState(
  input: InvalidateVehicleOperationalStateInput,
): Promise<void> {
  if (!input.orgId) return;

  const allVehicleIds = uniqueVehicleIds([
    ...input.vehicleIds,
    ...(input.previousVehicleIds ?? []),
  ]);

  const optimisticKind = input.optimistic ?? defaultOptimisticForReason(input.reason);
  const store = useFleetMapStore.getState();

  let optimisticRollbackToken: string | null = null;
  if (optimisticKind !== 'none') {
    const patches = deriveOptimisticPatches(
      store.vehicles,
      allVehicleIds,
      optimisticKind,
      input.bookingContext,
    );
    if (patches.length > 0) {
      optimisticRollbackToken = store.applyOptimisticOperationalPatches(patches);
    }
  }

  const context: VehicleOperationalInvalidationContext = {
    ...input,
    allVehicleIds,
    optimisticRollbackToken,
  };

  const keys = buildInvalidationKeys(
    input.orgId,
    allVehicleIds.length > 0 ? allVehicleIds : ['__org__'],
    input.reason,
  );
  const matchedHandlers = getHandlersForKeys(keys);

  const results = await Promise.allSettled(
    matchedHandlers.map((handler: VehicleOperationalInvalidationHandler) =>
      Promise.resolve().then(() => handler(context)),
    ),
  );

  const hadFailure = results.some((r) => r.status === 'rejected');

  if (hadFailure && optimisticRollbackToken) {
    store.rollbackOptimisticOperationalPatches(optimisticRollbackToken);
  } else if (optimisticRollbackToken) {
    store.commitOptimisticOperationalPatches(optimisticRollbackToken);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<VehicleOperationalInvalidatedDetail>(
        VEHICLE_OPERATIONAL_INVALIDATED_EVENT,
        {
          detail: {
            orgId: input.orgId,
            vehicleIds: allVehicleIds,
            reason: input.reason,
          },
        },
      ),
    );
  }
}

/** Convenience helper for booking mutations with optional vehicle swap. */
export function invalidateVehicleOperationalAfterBookingChange(args: {
  orgId: string;
  vehicleId: string | null | undefined;
  previousVehicleId?: string | null;
  reason: Extract<
    VehicleOperationalInvalidationReason,
    'booking-created' | 'booking-updated' | 'booking-cancelled' | 'booking-no-show'
  >;
  bookingContext?: InvalidateVehicleOperationalStateInput['bookingContext'];
}): Promise<void> {
  const vehicleIds = uniqueVehicleIds([args.vehicleId]);
  const previousVehicleIds = uniqueVehicleIds([args.previousVehicleId]);

  if (vehicleIds.length === 0 && previousVehicleIds.length === 0) {
    return Promise.resolve();
  }

  return invalidateVehicleOperationalState({
    orgId: args.orgId,
    vehicleIds: vehicleIds.length > 0 ? vehicleIds : previousVehicleIds,
    previousVehicleIds:
      previousVehicleIds.length > 0 &&
      vehicleIds.length > 0 &&
      previousVehicleIds[0] !== vehicleIds[0]
        ? previousVehicleIds
        : undefined,
    reason: args.reason,
    bookingContext: args.bookingContext,
  });
}
