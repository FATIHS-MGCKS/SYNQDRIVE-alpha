import { VehicleRegistryLifecycleOutboxEventType } from '@prisma/client';

export const VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_WORKER_INTERVAL_MS = 30_000;
export const VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_BATCH_SIZE = 25;
export const VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_MAX_RETRIES = 12;
export const VEHICLE_REGISTRY_LIFECYCLE_OUTBOX_CLAIM_LEASE_MS = 5 * 60_000;

/** Lifecycle event types with a registered required handler in this worker slice. */
export const SUPPORTED_REGISTRY_LIFECYCLE_HANDLER_EVENT_TYPES: readonly VehicleRegistryLifecycleOutboxEventType[] =
  [
    VehicleRegistryLifecycleOutboxEventType.VEHICLE_ACTIVATED,
    VehicleRegistryLifecycleOutboxEventType.VEHICLE_OFFBOARDED,
  ];
