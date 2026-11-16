import { VehicleRegistryLifecycle } from '@prisma/client';

/** Lifecycle states eligible for product vehicle access. */
export const PRODUCT_VEHICLE_ACCESS_ELIGIBLE_LIFECYCLES: VehicleRegistryLifecycle[] = [
  VehicleRegistryLifecycle.ACTIVE,
];