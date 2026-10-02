/** Governed offboarding reasons (VO-5A). Aligns with VO-1 / TARGET_ARCHITECTURE terminology. */
export type VehicleOffboardReasonCode =
  | 'OFFBOARD_SOLD'
  | 'REMOVE_FROM_PRODUCT'
  | 'ADMINISTRATIVE_OFFBOARD';

const ALLOWED: ReadonlySet<VehicleOffboardReasonCode> = new Set([
  'OFFBOARD_SOLD',
  'REMOVE_FROM_PRODUCT',
  'ADMINISTRATIVE_OFFBOARD',
]);

export function assertVehicleOffboardReason(
  reason: string,
): VehicleOffboardReasonCode {
  if (!ALLOWED.has(reason as VehicleOffboardReasonCode)) {
    throw new Error(`Invalid offboard reason: ${reason}`);
  }
  return reason as VehicleOffboardReasonCode;
}
