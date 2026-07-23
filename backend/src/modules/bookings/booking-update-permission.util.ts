import { ForbiddenException } from '@nestjs/common';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import { BOOKING_PERMISSION_REQUIREMENTS, type BookingPermissionAction } from './booking-permission.constants';

/**
 * Validates that the caller holds every permission required by the fields
 * present in a booking PATCH body.
 */
export function assertBookingUpdatePermissions(
  body: Record<string, unknown>,
  permissions: MembershipPermissionsMap | null | undefined,
): void {
  const perms = normalizeMembershipPermissions(permissions);
  const required = collectBookingUpdatePermissionActions(body);

  for (const action of required) {
    const requirement = BOOKING_PERMISSION_REQUIREMENTS[action];
    if (!evaluateModulePermission(perms, requirement.module, requirement.level)) {
      throw new ForbiddenException(
        `Missing permission: ${requirement.module}.${requirement.level}`,
      );
    }
  }
}

export function collectBookingUpdatePermissionActions(
  body: Record<string, unknown>,
): BookingPermissionAction[] {
  const actions = new Set<BookingPermissionAction>(['booking.update']);

  if (body.startDate !== undefined || body.endDate !== undefined) {
    actions.add('booking.update_schedule');
  }
  if (body.customerId !== undefined) {
    actions.add('booking.update_customer');
  }
  if (body.vehicleId !== undefined) {
    actions.add('booking.update_vehicle');
  }
  if (body.status !== undefined) {
    const status =
      typeof body.status === 'string'
        ? body.status
        : (body.status as { set?: string } | undefined)?.set;
    if (status === 'CONFIRMED') actions.add('booking.confirm');
    if (status === 'CANCELLED') actions.add('booking.cancel');
    if (status === 'NO_SHOW') actions.add('booking.mark_no_show');
    if (status === 'COMPLETED') actions.add('booking.complete');
  }

  return [...actions];
}
