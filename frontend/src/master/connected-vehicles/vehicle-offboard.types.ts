export type VehicleOffboardReasonCode =
  | 'OFFBOARD_SOLD'
  | 'REMOVE_FROM_PRODUCT'
  | 'ADMINISTRATIVE_OFFBOARD';

export type VehicleRegistryLifecycle = 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED';

export type VehicleOffboardPreflightBlockCode =
  | 'ACTIVE_RENTAL'
  | 'ACTIVE_BOOKING'
  | 'ONGOING_TRIP'
  | 'OPEN_HANDOVER';

export type VehicleOffboardPreflightWarningCode =
  | 'OPEN_DAMAGE_WARNING'
  | 'OPEN_MAINTENANCE_WARNING'
  | 'UNPAID_BILLING_WARNING'
  | 'FLEET_TASK_WARNING';

export type VehicleOffboardHttpResponse = {
  vehicleId: string;
  organizationId: string;
  registryLifecycle: 'OFFBOARDED';
  offboardedAt: string;
  reason: VehicleOffboardReasonCode;
  idempotentReplay: boolean;
  warnings: VehicleOffboardPreflightWarningCode[];
};

export type VehicleOffboardIntent = {
  organizationId: string;
  vehicleId: string;
  reason: VehicleOffboardReasonCode;
  idempotencyKey: string;
  note?: string;
};
