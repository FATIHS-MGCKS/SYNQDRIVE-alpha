import { ConflictException } from '@nestjs/common';

export const LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE = 'LEGACY_VEHICLE_DESTRUCTION_DISABLED';

export const CANONICAL_VEHICLE_OFFBOARD_ROUTE =
  'POST /admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard';

export const LEGACY_VEHICLE_DELETE_DISABLED_ACTION = 'CONTACT_MASTER_ADMIN_FOR_OFFBOARD';

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

/** VO5C-P2B3: org-scoped and direct vehicle DELETE retired — fail-closed. */
export function legacyVehicleDeleteDisabledException(): ConflictException {
  return new ConflictException({
    code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
    message:
      'Direct vehicle deletion is disabled. Request an authorized lifecycle offboarding operation instead.',
    action: LEGACY_VEHICLE_DELETE_DISABLED_ACTION,
    canonicalRoute: CANONICAL_VEHICLE_OFFBOARD_ROUTE,
    canonicalOffboardAuthority:
      'MASTER_ADMIN with MASTER_INTEGRATIONS MFA only; not authorized for tenant fleet.manage callers',
  });
}
