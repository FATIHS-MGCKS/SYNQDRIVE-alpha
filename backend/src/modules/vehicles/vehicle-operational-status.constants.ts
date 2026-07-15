import { VehicleStatus } from '@prisma/client';

/** Base availability / maintenance states writable via PATCH .../vehicles/:id/status only. */
export const ADMIN_WRITABLE_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  VehicleStatus.AVAILABLE,
  VehicleStatus.IN_SERVICE,
  VehicleStatus.OUT_OF_SERVICE,
]);

/** Persisted only via booking handover / lifecycle — never generic PATCH. */
export const BOOKING_CONTROLLED_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  VehicleStatus.RENTED,
  VehicleStatus.RESERVED,
]);
