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

export type VehicleOffboardPreflightResult = {
  allowed: boolean;
  blockingReasons: VehicleOffboardPreflightBlockCode[];
  warnings: VehicleOffboardPreflightWarningCode[];
};
