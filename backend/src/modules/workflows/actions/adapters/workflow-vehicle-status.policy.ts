import { VehicleStatus } from '@prisma/client';

/** Allowed operational transitions — does not bypass handover/booking truth. */
export const VEHICLE_STATUS_TRANSITIONS: Record<VehicleStatus, readonly VehicleStatus[]> = {
  AVAILABLE: ['IN_SERVICE', 'OUT_OF_SERVICE', 'RESERVED'],
  RESERVED: ['AVAILABLE', 'IN_SERVICE', 'OUT_OF_SERVICE'],
  RENTED: ['AVAILABLE', 'IN_SERVICE', 'OUT_OF_SERVICE'],
  IN_SERVICE: ['OUT_OF_SERVICE', 'AVAILABLE'],
  OUT_OF_SERVICE: ['IN_SERVICE', 'AVAILABLE'],
};

export function isVehicleStatusTransitionAllowed(
  from: VehicleStatus,
  to: VehicleStatus,
): boolean {
  if (from === to) return true;
  return (VEHICLE_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export function requiresApprovalForVehicleStatusChange(input: {
  from: VehicleStatus;
  to: VehicleStatus;
  rentalBlocked: boolean;
  force?: boolean;
}): boolean {
  if (input.force === true) return true;
  if (input.rentalBlocked && input.to === 'AVAILABLE') return true;
  if (input.from === 'IN_SERVICE' && input.to === 'AVAILABLE') return true;
  if (input.from === 'OUT_OF_SERVICE' && input.to === 'AVAILABLE') return true;
  if (input.to === 'RENTED') return true;
  return false;
}
