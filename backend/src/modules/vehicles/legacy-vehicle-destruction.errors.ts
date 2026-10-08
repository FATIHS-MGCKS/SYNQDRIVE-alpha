import { ConflictException } from '@nestjs/common';

export const LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE = 'LEGACY_VEHICLE_DESTRUCTION_DISABLED';

export const CANONICAL_VEHICLE_OFFBOARD_ROUTE =
  'POST /admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard';

export function legacyVehicleDestructionDisabledException(): ConflictException {
  return new ConflictException({
    code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
    message:
      'Legacy vehicle deregistration is disabled. Use the explicit vehicle onboarding offboard API.',
    action: 'USE_CANONICAL_OFFBOARD',
    canonicalRoute: CANONICAL_VEHICLE_OFFBOARD_ROUTE,
    requiredFields: ['reason', 'idempotencyKey'],
  });
}
