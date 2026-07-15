import { VehicleStatus } from '@prisma/client';

/** Base availability / maintenance states writable via PATCH .../vehicles/:id/status only. */
export const ADMIN_WRITABLE_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  VehicleStatus.AVAILABLE,
  VehicleStatus.IN_SERVICE,
  VehicleStatus.OUT_OF_SERVICE,
]);

/**
 * Persisted only via booking handover pickup — compatibility hint for legacy readers.
 * Canonical ACTIVE_RENTED is always derived by VehicleOperationalStateEngine.
 */
export const BOOKING_HANDOVER_COMPAT_RENTED_STATUS = VehicleStatus.RENTED;

/** Legacy booking-controlled values — must not be written by admin or workflow. */
export const BOOKING_CONTROLLED_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  VehicleStatus.RENTED,
  VehicleStatus.RESERVED,
]);

/** Workflow may only set maintenance-domain base states (same as admin manual). */
export const WORKFLOW_WRITABLE_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> =
  ADMIN_WRITABLE_VEHICLE_STATUSES;

/**
 * RESERVED is derived only — never persist via any write domain.
 * Existing DB rows are diagnostic input for the operational state engine.
 */
export const NON_PERSISTABLE_DERIVED_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  VehicleStatus.RESERVED,
]);

export type VehicleRawStatusWriteDomain =
  | 'BOOKING_HANDOVER'
  | 'BOOKING_LIFECYCLE'
  | 'ADMIN_MANUAL'
  | 'WORKFLOW_MAINTENANCE';
